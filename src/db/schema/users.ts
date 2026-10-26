import { sql } from 'drizzle-orm';
import { boolean, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { roleEnum } from './enums';

/**
 * Application users. Identity lives in Neon Managed Better Auth (`neon_auth` schema);
 * this table is the source of truth for authorization (role, active) and is invite-only.
 * `email` is stored lower-cased. Deleting a user keeps the row (checklists and the audit log point
 * at it) but sets `deleted_at`, removes the sign-in and frees the email for a new invite.
 */
export const appUsers = pgTable(
  'app_users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    authUserId: text('auth_user_id').unique(),
    email: text('email').notNull(),
    name: text('name').notNull(),
    role: roleEnum('role').notNull().default('caller'),
    active: boolean('active').notNull().default(true),
    invitedBy: uuid('invited_by'),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('app_users_email_live_uq')
      .on(t.email)
      .where(sql`${t.deletedAt} is null`),
  ],
);

export type AppUser = typeof appUsers.$inferSelect;
export type NewAppUser = typeof appUsers.$inferInsert;
