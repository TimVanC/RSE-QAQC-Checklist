import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import {
  answerSourceEnum,
  answerValueEnum,
  checklistStatusEnum,
  checklistTypeEnum,
  projectTypeEnum,
} from './enums';
import { hcpJobs, technicians } from './hcp';
import { appUsers } from './users';

export const checklists = pgTable(
  'checklists',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    hcpJobId: text('hcp_job_id')
      .notNull()
      .references(() => hcpJobs.hcpJobId),
    hcpAppointmentId: text('hcp_appointment_id'),
    technicianId: uuid('technician_id').references(() => technicians.id),
    type: checklistTypeEnum('type').notNull(),
    parentChecklistId: uuid('parent_checklist_id').references((): AnyPgColumn => checklists.id),
    configVersion: integer('config_version').notNull().default(1),
    /** Calendar date (America/New_York) the checklist belongs to; defaults to the job's scheduled day. */
    callDate: date('call_date').notNull(),
    status: checklistStatusEnum('status').notNull().default('in_progress'),
    // Header fields (workbook C3:C7, E78)
    projectType: projectTypeEnum('project_type'),
    customerName: text('customer_name').notNull().default(''),
    projectLocation: text('project_location').notNull().default(''),
    projectDate: date('project_date'),
    referralProjectNo: text('referral_project_no').notNull().default(''),
    // Step-attached fields (F26:F28, E34, I34)
    permitSubmittedOn: date('permit_submitted_on'),
    permitFollowupOn: date('permit_followup_on'),
    permitApprovedOn: date('permit_approved_on'),
    partsReceivedOn: date('parts_received_on'),
    partsOrderNo: text('parts_order_no'),
    notes: text('notes'),
    submittedBy: uuid('submitted_by').references(() => appUsers.id),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    reopenedBy: uuid('reopened_by').references(() => appUsers.id),
    reopenedAt: timestamp('reopened_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => appUsers.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('checklists_one_task_per_job').on(t.hcpJobId).where(sql`${t.type} = 'task'`),
    index('checklists_technician_date_idx').on(t.technicianId, t.callDate),
    index('checklists_status_idx').on(t.status),
    index('checklists_parent_idx').on(t.parentChecklistId),
    index('checklists_job_idx').on(t.hcpJobId),
    check('checklists_callback_has_parent', sql`${t.type} = 'task' OR ${t.parentChecklistId} IS NOT NULL`),
  ],
);

export const checklistAnswers = pgTable(
  'checklist_answers',
  {
    checklistId: uuid('checklist_id')
      .notNull()
      .references(() => checklists.id, { onDelete: 'cascade' }),
    stepKey: text('step_key').notNull(),
    value: answerValueEnum('value'),
    source: answerSourceEnum('source').notNull().default('manual'),
    autoSuggestedValue: answerValueEnum('auto_suggested_value'),
    autoEvidence: jsonb('auto_evidence').$type<Record<string, unknown>>(),
    autoComputedAt: timestamp('auto_computed_at', { withTimezone: true }),
    answeredBy: uuid('answered_by').references(() => appUsers.id),
    answeredAt: timestamp('answered_at', { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.checklistId, t.stepKey] })],
);

/** Per-checklist scoring, recomputed on every answer write (see src/lib/scoring). */
export const checklistScores = pgTable('checklist_scores', {
  checklistId: uuid('checklist_id')
    .primaryKey()
    .references(() => checklists.id, { onDelete: 'cascade' }),
  serviceQuote: smallint('service_quote').notNull().default(0),
  inProgress: smallint('in_progress').notNull().default(0),
  completed: smallint('completed').notNull().default(0),
  failOpsCheck: smallint('fail_ops_check').notNull().default(0),
  failQaqc: smallint('fail_qaqc').notNull().default(0),
  failToolControl: smallint('fail_tool_control').notNull().default(0),
  failCallback: smallint('fail_callback').notNull().default(0),
  totalFailures: smallint('total_failures').notNull().default(0),
  failuresValue: smallint('failures_value').notNull().default(0),
  bottomLine: smallint('bottom_line').notNull().default(4),
  perfectTask: smallint('perfect_task').notNull().default(0),
  completedMarks: smallint('completed_marks').notNull().default(0),
  computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
});

export const payPeriods = pgTable(
  'pay_periods',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    label: text('label').notNull(),
    startDate: date('start_date').notNull().unique(),
    endDate: date('end_date').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('pay_periods_end_after_start', sql`${t.endDate} >= ${t.startDate}`)],
);

export type Checklist = typeof checklists.$inferSelect;
export type NewChecklist = typeof checklists.$inferInsert;
export type ChecklistAnswer = typeof checklistAnswers.$inferSelect;
export type ChecklistScoreRow = typeof checklistScores.$inferSelect;
export type PayPeriod = typeof payPeriods.$inferSelect;
