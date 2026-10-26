import 'server-only';
import { asc, isNull } from 'drizzle-orm';
import { getDb } from '@/src/db';
import { appUsers, type AppUser } from '@/src/db/schema/users';

export async function listUsers(): Promise<AppUser[]> {
  return getDb()
    .select()
    .from(appUsers)
    .where(isNull(appUsers.deletedAt))
    .orderBy(asc(appUsers.name));
}
