import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { roleEnum } from './enums';

/**
 * Application users. Identity lives in Neon Managed Better Auth (`neon_auth` schema);
 * this table is the source of truth for authorization (role, active) and is invite-only.
 * `email` is stored lower-cased.
 */
export const appUsers = pgTable('app_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  authUserId: text('auth_user_id').unique(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  role: roleEnum('role').notNull().default('caller'),
  active: boolean('active').notNull().default(true),
  invitedBy: uuid('invited_by'),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type AppUser = typeof appUsers.$inferSelect;
export type NewAppUser = typeof appUsers.$inferInsert;
