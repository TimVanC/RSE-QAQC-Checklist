import { bigserial, index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { syncKindEnum, syncStatusEnum, webhookStatusEnum } from './enums';
import { appUsers } from './users';

/** Who changed what and when, on every checklist edit, submit, reopen and admin action. */
export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id').references(() => appUsers.id),
    entity: text('entity').notNull(),
    entityId: text('entity_id').notNull(),
    action: text('action').notNull(),
    before: jsonb('before').$type<Record<string, unknown>>(),
    after: jsonb('after').$type<Record<string, unknown>>(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_log_entity_idx').on(t.entity, t.entityId), index('audit_log_at_idx').on(t.at)],
);

export const syncRuns = pgTable(
  'sync_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: syncKindEnum('kind').notNull(),
    trigger: text('trigger').notNull().default('cron'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    status: syncStatusEnum('status').notNull().default('running'),
    counts: jsonb('counts').$type<Record<string, number>>().notNull().default({}),
    error: text('error'),
    windowStart: timestamp('window_start', { withTimezone: true }),
    windowEnd: timestamp('window_end', { withTimezone: true }),
    startedBy: uuid('started_by').references(() => appUsers.id),
  },
  (t) => [index('sync_runs_started_idx').on(t.startedAt)],
);

export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    event: text('event').notNull(),
    dedupeKey: text('dedupe_key').notNull().unique(),
    hcpEntityId: text('hcp_entity_id'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    status: webhookStatusEnum('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    error: text('error'),
  },
  (t) => [index('webhook_events_status_idx').on(t.status, t.receivedAt)],
);

/** Small key/value settings edited by admins (pay period rule, project type rules, exclusions). */
export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').$type<unknown>().notNull(),
  updatedBy: uuid('updated_by').references(() => appUsers.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type SyncRun = typeof syncRuns.$inferSelect;
export type WebhookEvent = typeof webhookEvents.$inferSelect;
