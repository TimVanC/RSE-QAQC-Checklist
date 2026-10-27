import { date, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { checklists } from './checklists';
import { actionStatusEnum } from './enums';
import { appUsers } from './users';

/**
 * A follow-up attached to a failed checklist step: what needs to happen, who is responsible and
 * by when. Resolved by a manager with a note. Does not affect the checklist score.
 */
export const correctiveActions = pgTable(
  'corrective_actions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    checklistId: uuid('checklist_id')
      .notNull()
      .references(() => checklists.id, { onDelete: 'cascade' }),
    stepKey: text('step_key').notNull(),
    description: text('description').notNull(),
    /** Free text: a technician's name or "Office". */
    owner: text('owner').notNull().default(''),
    dueDate: date('due_date'),
    status: actionStatusEnum('status').notNull().default('open'),
    resolutionNote: text('resolution_note'),
    createdBy: uuid('created_by').references(() => appUsers.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedBy: uuid('resolved_by').references(() => appUsers.id),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (t) => [
    index('corrective_actions_checklist_idx').on(t.checklistId),
    index('corrective_actions_status_due_idx').on(t.status, t.dueDate),
  ],
);

export type CorrectiveActionRow = typeof correctiveActions.$inferSelect;
