'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getDb } from '@/src/db';
import { appUsers } from '@/src/db/schema/users';
import { recordAudit } from '@/src/lib/audit';
import { isRole } from '@/src/lib/auth/roles';
import { getAuth } from '@/src/lib/auth/server';
import { ForbiddenError, requireRole } from '@/src/lib/auth/session';
import type { ActionResult } from './checklists';

function fail(error: string): ActionResult<never> {
  return { ok: false, error };
}

function errorMessage(err: unknown): string {
  if (err instanceof ForbiddenError) return err.message;
  if (err instanceof Error && err.name === 'UnauthenticatedError') return 'Please sign in again.';
  console.error('[users] action failed', err);
  return 'Something went wrong. Please try again.';
}

function randomPassword(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString('base64url');
}

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().min(1).max(120),
  role: z.string().refine(isRole, 'invalid role'),
  sendLink: z.boolean().default(true),
});

/**
 * Invite a user: create the app_users row (authorisation) and the Neon Auth user (identity),
 * then email the first magic link. Sign-up is disabled on the auth project, so this is the only
 * way in. The password set on the auth user is random and never used.
 */
export async function inviteUser(input: {
  email: string;
  name: string;
  role: string;
  sendLink?: boolean;
}): Promise<ActionResult<{ id: string; linkSent: boolean }>> {
  try {
    const admin = await requireRole('admin');
    const parsed = inviteSchema.safeParse(input);
    if (!parsed.success) return fail('Enter a valid email, name and role.');
    const { email, name, role, sendLink } = parsed.data;
    const db = getDb();

    const [existing] = await db.select({ id: appUsers.id }).from(appUsers).where(eq(appUsers.email, email)).limit(1);
    if (existing) return fail('A user with that email already exists.');

    const auth = getAuth();
    const created = await auth.admin.createUser({ email, name, password: randomPassword(), role: 'user' });
    if (created.error && !/exist/i.test(created.error.message ?? '')) {
      return fail(`Could not create the sign-in account: ${created.error.message}`);
    }
    const authUserId = created.data?.user?.id ?? null;

    const [row] = await db
      .insert(appUsers)
      .values({ email, name, role: role as 'caller' | 'manager' | 'admin', active: true, authUserId, invitedBy: admin.id })
      .returning({ id: appUsers.id });
    await recordAudit(db, { userId: admin.id, entity: 'app_user', entityId: row.id, action: 'invite', after: { email, name, role } });

    let linkSent = false;
    if (sendLink) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
      const sent = await auth.signIn.magicLink({ email, callbackURL: `${appUrl}/` });
      linkSent = !sent.error;
    }
    revalidatePath('/admin/users');
    return { ok: true, data: { id: row.id, linkSent } };
  } catch (err) {
    return fail(errorMessage(err));
  }
}

const roleSchema = z.object({ userId: z.string().uuid(), role: z.string().refine(isRole, 'invalid role') });

export async function setUserRole(input: { userId: string; role: string }): Promise<ActionResult> {
  try {
    const admin = await requireRole('admin');
    const parsed = roleSchema.safeParse(input);
    if (!parsed.success) return fail('Invalid role.');
    const { userId, role } = parsed.data;
    if (userId === admin.id && role !== 'admin') return fail('You cannot remove your own admin role.');
    const db = getDb();
    const [before] = await db.select({ role: appUsers.role }).from(appUsers).where(eq(appUsers.id, userId)).limit(1);
    if (!before) return fail('User not found.');
    await db.update(appUsers).set({ role: role as 'caller' | 'manager' | 'admin', updatedAt: new Date() }).where(eq(appUsers.id, userId));
    await recordAudit(db, { userId: admin.id, entity: 'app_user', entityId: userId, action: 'set_role', before: { role: before.role }, after: { role } });
    revalidatePath('/admin/users');
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(errorMessage(err));
  }
}

const activeSchema = z.object({ userId: z.string().uuid(), active: z.boolean() });

export async function setUserActive(input: z.infer<typeof activeSchema>): Promise<ActionResult> {
  try {
    const admin = await requireRole('admin');
    const parsed = activeSchema.safeParse(input);
    if (!parsed.success) return fail('Invalid request.');
    const { userId, active } = parsed.data;
    if (userId === admin.id && !active) return fail('You cannot deactivate yourself.');
    const db = getDb();
    const [row] = await db.select({ active: appUsers.active, authUserId: appUsers.authUserId }).from(appUsers).where(eq(appUsers.id, userId)).limit(1);
    if (!row) return fail('User not found.');
    await db.update(appUsers).set({ active, updatedAt: new Date() }).where(eq(appUsers.id, userId));
    if (!active && row.authUserId) {
      // Best effort: end their sessions so the change is immediate.
      const auth = getAuth() as unknown as { admin?: { revokeUserSessions?: (o: { userId: string }) => Promise<unknown> } };
      await auth.admin?.revokeUserSessions?.({ userId: row.authUserId }).catch(() => undefined);
    }
    await recordAudit(db, { userId: admin.id, entity: 'app_user', entityId: userId, action: active ? 'activate' : 'deactivate', before: { active: row.active }, after: { active } });
    revalidatePath('/admin/users');
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(errorMessage(err));
  }
}

export async function resendMagicLink(userId: string): Promise<ActionResult> {
  try {
    await requireRole('admin');
    if (!z.string().uuid().safeParse(userId).success) return fail('Invalid user.');
    const db = getDb();
    const [row] = await db.select({ email: appUsers.email, active: appUsers.active }).from(appUsers).where(eq(appUsers.id, userId)).limit(1);
    if (!row) return fail('User not found.');
    if (!row.active) return fail('User is deactivated.');
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
    const sent = await getAuth().signIn.magicLink({ email: row.email, callbackURL: `${appUrl}/` });
    if (sent.error) return fail(sent.error.message || 'Could not send the link.');
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(errorMessage(err));
  }
}
