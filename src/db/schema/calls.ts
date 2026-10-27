import { date, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { callOutcomeEnum } from './enums';
import { hcpJobs } from './hcp';
import { appUsers } from './users';

/**
 * One row per call attempt the team makes about a job: reached, no answer, or asked to call back.
 * Attached to the job (not the checklist) so "Not reached" can be logged from the queue before a
 * checklist exists. Doubles as the nightly check-in on multi-day jobs (outcome reached + a note).
 */
export const callLog = pgTable(
  'call_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    hcpJobId: text('hcp_job_id')
      .notNull()
      .references(() => hcpJobs.hcpJobId, { onDelete: 'cascade' }),
    /** Calendar day (America/New_York) the call was for; usually the queue date it was logged from. */
    callDate: date('call_date').notNull(),
    outcome: callOutcomeEnum('outcome').notNull(),
    note: text('note'),
    calledBy: uuid('called_by').references(() => appUsers.id),
    calledAt: timestamp('called_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('call_log_job_called_at_idx').on(t.hcpJobId, t.calledAt)],
);

export type CallLogRow = typeof callLog.$inferSelect;
export type NewCallLogRow = typeof callLog.$inferInsert;
