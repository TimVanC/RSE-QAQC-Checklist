import 'server-only';
import { eq } from 'drizzle-orm';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { getDb } from '@/src/db';
import { appUsers } from '@/src/db/schema/users';
import type { Role } from '@/src/db/schema/enums';
import { hasRole } from './roles';
import { getAuth } from './server';

export interface CurrentUser {
  id: string;
  authUserId: string;
  email: string;
  name: string;
  role: Role;
}

export class ForbiddenError extends Error {
  constructor(message = 'You do not have permission to do that.') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class UnauthenticatedError extends Error {
  constructor() {
    super('Not signed in.');
    this.name = 'UnauthenticatedError';
  }
}

/**
 * Resolve the signed-in Neon Auth user to an `app_users` row. Users are invited by an admin,
 * so a session without a matching active row has no access. On first login the row is linked
 * by email and `auth_user_id` is stored. Memoised per request.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const { data: session } = await getAuth().getSession();
  const sessionUser = session?.user;
  if (!sessionUser?.id) return null;

  const db = getDb();
  const email = (sessionUser.email ?? '').trim().toLowerCase();

  let [row] = await db.select().from(appUsers).where(eq(appUsers.authUserId, sessionUser.id)).limit(1);
  if (!row && email) {
    [row] = await db.select().from(appUsers).where(eq(appUsers.email, email)).limit(1);
    // Never attach a session to a row already linked to a different auth user.
    if (row?.authUserId && row.authUserId !== sessionUser.id) return null;
    if (row && !row.authUserId) {
      await db
        .update(appUsers)
        .set({ authUserId: sessionUser.id, lastLoginAt: new Date(), updatedAt: new Date() })
        .where(eq(appUsers.id, row.id));
      row = { ...row, authUserId: sessionUser.id };
    }
  }
  if (!row || !row.active) return null;

  return {
    id: row.id,
    authUserId: sessionUser.id,
    email: row.email,
    name: row.name || sessionUser.name || row.email,
    role: row.role,
  };
});

/** For pages: redirect to login (no session) or to /no-access (session without an app user). */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (user) return user;
  const { data: session } = await getAuth().getSession();
  redirect(session?.user ? '/no-access' : '/login');
}

/** For pages: like requireUser, then enforce a minimum role; otherwise redirect to /forbidden. */
export async function requirePageRole(minimum: Role): Promise<CurrentUser> {
  const user = await requireUser();
  if (!hasRole(user.role, minimum)) redirect('/forbidden');
  return user;
}

/** For server actions and route handlers: throw instead of redirecting. */
export async function requireRole(minimum: Role): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthenticatedError();
  if (!hasRole(user.role, minimum)) throw new ForbiddenError();
  return user;
}
