'use server';

import { and, eq, isNull, ne } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getDb } from '@/src/db';
import { appUsers } from '@/src/db/schema/users';
import { recordAudit } from '@/src/lib/audit';
import { generateTemporaryPassword, validatePassword } from '@/src/lib/auth/password';
import { isRole } from '@/src/lib/auth/roles';
import { getAuth } from '@/src/lib/auth/server';
import { ForbiddenError, requireRole } from '@/src/lib/auth/session';
import type { ActionResult } from './checklists';

type Role = 'caller' | 'manager' | 'admin';

function fail(error: string): ActionResult<never> {
  return { ok: false, error };
}

function errorMessage(err: unknown): string {
  if (err instanceof ForbiddenError) return err.message;
  if (err instanceof Error && err.name === 'UnauthenticatedError') return 'Please sign in again.';
  console.error('[users] action failed', err);
  return 'Something went wrong. Please try again.';
}

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');
}

/** Admins of the app must also be admins in Neon Auth so they can set other users' passwords. */
function authRoleFor(role: Role): 'admin' | 'user' {
  return role === 'admin' ? 'admin' : 'user';
}

async function sendResetEmail(email: string): Promise<boolean> {
  const { error } = await getAuth().requestPasswordReset({
    email,
    redirectTo: `${appUrl()}/reset-password`,
  });
  return !error;
}

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().min(1).max(120),
  role: z.string().refine(isRole, 'invalid role'),
  temporaryPassword: z.string().optional(),
  sendResetEmail: z.boolean().default(false),
});

/**
 * Invite a user: create the app_users row (authorisation) and the Neon Auth user (identity) with
 * either the temporary password the admin typed or a generated one. Optionally email a
 * set-password link so the admin never has to share a password.
 */
export async function inviteUser(input: {
  email: string;
  name: string;
  role: string;
  temporaryPassword?: string;
  sendResetEmail?: boolean;
}): Promise<
  ActionResult<{ id: string; temporaryPassword: string | null; resetEmailSent: boolean }>
> {
  try {
    const admin = await requireRole('admin');
    const parsed = inviteSchema.safeParse(input);
    if (!parsed.success) return fail('Enter a valid email, name and role.');
    const { email, name, sendResetEmail: wantEmail } = parsed.data;
    const role = parsed.data.role as Role;
    const typed = parsed.data.temporaryPassword?.trim() ?? '';
    if (typed) {
      const policy = validatePassword(typed);
      if (policy) return fail(`Temporary password: ${policy}`);
    }
    const password = typed || generateTemporaryPassword();
    const db = getDb();

    const [existing] = await db
      .select({ id: appUsers.id })
      .from(appUsers)
      .where(and(eq(appUsers.email, email), isNull(appUsers.deletedAt)))
      .limit(1);
    if (existing) return fail('A user with that email already exists.');

    const auth = getAuth();
    const created = await auth.admin.createUser({ email, name, password, role: authRoleFor(role) });
    if (created.error && !/exist/i.test(created.error.message ?? '')) {
      return fail(`Could not create the sign-in account: ${created.error.message}`);
    }
    const authUserId = created.data?.user?.id ?? null;

    const [row] = await db
      .insert(appUsers)
      .values({ email, name, role, active: true, authUserId, invitedBy: admin.id })
      .returning({ id: appUsers.id });
    await recordAudit(db, {
      userId: admin.id,
      entity: 'app_user',
      entityId: row.id,
      action: 'invite',
      after: { email, name, role },
    });

    const resetEmailSent = wantEmail ? await sendResetEmail(email) : false;
    revalidatePath('/admin/users');
    // Only reveal a password the admin did not type themselves when no email was sent.
    return {
      ok: true,
      data: { id: row.id, temporaryPassword: typed || wantEmail ? null : password, resetEmailSent },
    };
  } catch (err) {
    return fail(errorMessage(err));
  }
}

const roleSchema = z.object({
  userId: z.string().uuid(),
  role: z.string().refine(isRole, 'invalid role'),
});

export async function setUserRole(input: { userId: string; role: string }): Promise<ActionResult> {
  try {
    const admin = await requireRole('admin');
    const parsed = roleSchema.safeParse(input);
    if (!parsed.success) return fail('Invalid role.');
    const { userId } = parsed.data;
    const role = parsed.data.role as Role;
    if (userId === admin.id && role !== 'admin')
      return fail('You cannot remove your own admin role.');
    const db = getDb();
    const [before] = await db
      .select({ role: appUsers.role, authUserId: appUsers.authUserId })
      .from(appUsers)
      .where(eq(appUsers.id, userId))
      .limit(1);
    if (!before) return fail('User not found.');
    await db.update(appUsers).set({ role, updatedAt: new Date() }).where(eq(appUsers.id, userId));
    if (before.authUserId && authRoleFor(before.role) !== authRoleFor(role)) {
      const { error } = await getAuth().admin.setRole({
        userId: before.authUserId,
        role: authRoleFor(role),
      });
      if (error) console.warn('[users] could not mirror role to Neon Auth', error.message);
    }
    await recordAudit(db, {
      userId: admin.id,
      entity: 'app_user',
      entityId: userId,
      action: 'set_role',
      before: { role: before.role },
      after: { role },
    });
    revalidatePath('/admin/users');
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(errorMessage(err));
  }
}

const activeSchema = z.object({ userId: z.string().uuid(), active: z.boolean() });

export async function setUserActive(input: {
  userId: string;
  active: boolean;
}): Promise<ActionResult> {
  try {
    const admin = await requireRole('admin');
    const parsed = activeSchema.safeParse(input);
    if (!parsed.success) return fail('Invalid request.');
    const { userId, active } = parsed.data;
    if (userId === admin.id && !active) return fail('You cannot deactivate yourself.');
    const db = getDb();
    const [row] = await db
      .select({ active: appUsers.active, authUserId: appUsers.authUserId })
      .from(appUsers)
      .where(eq(appUsers.id, userId))
      .limit(1);
    if (!row) return fail('User not found.');
    await db.update(appUsers).set({ active, updatedAt: new Date() }).where(eq(appUsers.id, userId));
    if (!active && row.authUserId) {
      // Best effort: end their sessions so the change is immediate.
      const auth = getAuth() as unknown as {
        admin?: { revokeUserSessions?: (o: { userId: string }) => Promise<unknown> };
      };
      await auth.admin?.revokeUserSessions?.({ userId: row.authUserId }).catch(() => undefined);
    }
    await recordAudit(db, {
      userId: admin.id,
      entity: 'app_user',
      entityId: userId,
      action: active ? 'activate' : 'deactivate',
      before: { active: row.active },
      after: { active },
    });
    revalidatePath('/admin/users');
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(errorMessage(err));
  }
}

const tempPasswordSchema = z.object({ userId: z.string().uuid(), password: z.string().optional() });

/** Admin sets (or generates) a temporary password for a user who is locked out. */
export async function setTemporaryPassword(input: {
  userId: string;
  password?: string;
}): Promise<ActionResult<{ temporaryPassword: string | null }>> {
  try {
    const admin = await requireRole('admin');
    const parsed = tempPasswordSchema.safeParse(input);
    if (!parsed.success) return fail('Invalid request.');
    const { userId } = parsed.data;
    const typed = parsed.data.password?.trim() ?? '';
    if (typed) {
      const policy = validatePassword(typed);
      if (policy) return fail(policy);
    }
    const password = typed || generateTemporaryPassword();
    const db = getDb();
    const [row] = await db
      .select({ email: appUsers.email, active: appUsers.active, authUserId: appUsers.authUserId })
      .from(appUsers)
      .where(eq(appUsers.id, userId))
      .limit(1);
    if (!row) return fail('User not found.');
    if (!row.active) return fail('User is deactivated.');
    if (!row.authUserId)
      return fail('This user has no sign-in account yet; send them a set-password email instead.');
    const { error } = await getAuth().admin.setUserPassword({
      userId: row.authUserId,
      newPassword: password,
    });
    if (error) return fail(`Could not set the password: ${error.message}`);
    await recordAudit(db, {
      userId: admin.id,
      entity: 'app_user',
      entityId: userId,
      action: 'set_temporary_password',
    });
    return { ok: true, data: { temporaryPassword: typed ? null : password } };
  } catch (err) {
    return fail(errorMessage(err));
  }
}

/** Email the user a link to choose their own password (also the way to bootstrap a first login). */
export async function sendPasswordResetEmail(userId: string): Promise<ActionResult> {
  try {
    const admin = await requireRole('admin');
    if (!z.string().uuid().safeParse(userId).success) return fail('Invalid user.');
    const db = getDb();
    const [row] = await db
      .select({ email: appUsers.email, active: appUsers.active })
      .from(appUsers)
      .where(eq(appUsers.id, userId))
      .limit(1);
    if (!row) return fail('User not found.');
    if (!row.active) return fail('User is deactivated.');
    const sent = await sendResetEmail(row.email);
    if (!sent)
      return fail('Could not send the email. Check the email sender settings in Neon Auth.');
    await recordAudit(db, {
      userId: admin.id,
      entity: 'app_user',
      entityId: userId,
      action: 'send_password_reset',
    });
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(errorMessage(err));
  }
}

const deleteSchema = z.object({ userId: z.string().uuid() });

/**
 * Permanently removes a user's access: deletes the sign-in account in Neon Auth and marks the row
 * deleted, which hides it from the Users page and frees the email for a new invite. The row itself
 * stays so submitted checklists and the audit log still show who did what. Only deactivated users
 * can be deleted, so it is always a two-step action.
 */
export async function deleteUser(input: { userId: string }): Promise<ActionResult> {
  try {
    const admin = await requireRole('admin');
    const parsed = deleteSchema.safeParse(input);
    if (!parsed.success) return fail('Invalid request.');
    const { userId } = parsed.data;
    if (userId === admin.id) return fail('You cannot delete yourself.');
    const db = getDb();
    const [row] = await db
      .select({
        email: appUsers.email,
        name: appUsers.name,
        active: appUsers.active,
        authUserId: appUsers.authUserId,
        deletedAt: appUsers.deletedAt,
      })
      .from(appUsers)
      .where(eq(appUsers.id, userId))
      .limit(1);
    if (!row || row.deletedAt) return fail('User not found.');
    if (row.active) return fail('Deactivate the user first, then delete.');
    if (row.authUserId) {
      const { error } = await getAuth().admin.removeUser({ userId: row.authUserId });
      if (error && !/not found|no user/i.test(error.message ?? '')) {
        return fail(`Could not remove the sign-in account: ${error.message}`);
      }
    }
    const now = new Date();
    await db
      .update(appUsers)
      .set({ deletedAt: now, authUserId: null, active: false, updatedAt: now })
      .where(eq(appUsers.id, userId));
    await recordAudit(db, {
      userId: admin.id,
      entity: 'app_user',
      entityId: userId,
      action: 'delete',
      before: { email: row.email, name: row.name },
    });
    revalidatePath('/admin/users');
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(errorMessage(err));
  }
}

const profileSchema = z.object({
  userId: z.string().uuid(),
  name: z.string().trim().min(1, 'Name is required').max(120),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
});

/** Admin changes a user's name and/or email. The email is also changed in Neon Auth so they sign in with the new one. */
export async function updateUserProfile(input: {
  userId: string;
  name: string;
  email: string;
}): Promise<ActionResult> {
  try {
    const admin = await requireRole('admin');
    const parsed = profileSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid request.');
    const { userId, name, email } = parsed.data;
    const db = getDb();
    const [row] = await db
      .select({
        name: appUsers.name,
        email: appUsers.email,
        authUserId: appUsers.authUserId,
        deletedAt: appUsers.deletedAt,
      })
      .from(appUsers)
      .where(eq(appUsers.id, userId))
      .limit(1);
    if (!row || row.deletedAt) return fail('User not found.');
    if (row.name === name && row.email === email) return { ok: true, data: undefined };

    if (row.email !== email) {
      const [clash] = await db
        .select({ id: appUsers.id })
        .from(appUsers)
        .where(and(eq(appUsers.email, email), isNull(appUsers.deletedAt), ne(appUsers.id, userId)))
        .limit(1);
      if (clash) return fail('Another user already has that email.');
    }
    if (row.authUserId) {
      const data: { name?: string; email?: string } = {};
      if (row.name !== name) data.name = name;
      if (row.email !== email) data.email = email;
      const { error } = await getAuth().admin.updateUser({ userId: row.authUserId, data });
      if (error) return fail(`Could not update the sign-in account: ${error.message}`);
    }
    await db
      .update(appUsers)
      .set({ name, email, updatedAt: new Date() })
      .where(eq(appUsers.id, userId));
    await recordAudit(db, {
      userId: admin.id,
      entity: 'app_user',
      entityId: userId,
      action: 'update_profile',
      before: { name: row.name, email: row.email },
      after: { name, email },
    });
    revalidatePath('/admin/users');
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(errorMessage(err));
  }
}
