import { pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { technicianRoleEnum } from './enums';
import { hcpJobs, technicians } from './hcp';
import { appUsers } from './users';

/**
 * Who led a shared job. Kept apart from `hcp_job_assignees`, which the Housecall Pro sync deletes
 * and rewrites on every job update: this table is app data and survives the sync. A row without a
 * matching assignee (the technician was taken off the job in Housecall Pro) is ignored.
 */
export const jobRoles = pgTable(
  'job_roles',
  {
    hcpJobId: text('hcp_job_id')
      .notNull()
      .references(() => hcpJobs.hcpJobId, { onDelete: 'cascade' }),
    technicianId: uuid('technician_id')
      .notNull()
      .references(() => technicians.id, { onDelete: 'cascade' }),
    role: technicianRoleEnum('role').notNull(),
    setBy: uuid('set_by').references(() => appUsers.id),
    setAt: timestamp('set_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.hcpJobId, t.technicianId] })],
);

export type JobRoleRow = typeof jobRoles.$inferSelect;
