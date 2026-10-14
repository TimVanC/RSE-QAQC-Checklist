import 'server-only';
import { asc } from 'drizzle-orm';
import { getDb } from '@/src/db';
import { appUsers, type AppUser } from '@/src/db/schema/users';

export async function listUsers(): Promise<AppUser[]> {
  return getDb().select().from(appUsers).orderBy(asc(appUsers.name));
}
