import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/** Housecall Pro employees. `is_technician` decides who appears in the call queue. */
export const technicians = pgTable('technicians', {
  id: uuid('id').primaryKey().defaultRandom(),
  hcpEmployeeId: text('hcp_employee_id').notNull().unique(),
  firstName: text('first_name').notNull().default(''),
  lastName: text('last_name').notNull().default(''),
  email: text('email'),
  mobile: text('mobile'),
  colorHex: text('color_hex'),
  hcpRole: text('hcp_role'),
  isTechnician: boolean('is_technician').notNull().default(true),
  active: boolean('active').notNull().default(true),
  rawJson: jsonb('raw_json').$type<Record<string, unknown>>().notNull(),
  syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const hcpCustomers = pgTable('hcp_customers', {
  id: uuid('id').primaryKey().defaultRandom(),
  hcpCustomerId: text('hcp_customer_id').notNull().unique(),
  firstName: text('first_name').notNull().default(''),
  lastName: text('last_name').notNull().default(''),
  company: text('company'),
  email: text('email'),
  mobile: text('mobile'),
  tags: text('tags').array().notNull().default([]),
  rawJson: jsonb('raw_json').$type<Record<string, unknown>>().notNull(),
  hcpUpdatedAt: timestamp('hcp_updated_at', { withTimezone: true }),
  syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
});

export const hcpJobs = pgTable(
  'hcp_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    hcpJobId: text('hcp_job_id').notNull().unique(),
    invoiceNumber: text('invoice_number'),
    hcpCustomerId: text('hcp_customer_id').references(() => hcpCustomers.hcpCustomerId),
    customerName: text('customer_name').notNull().default(''),
    addressLine1: text('address_line1'),
    addressLine2: text('address_line2'),
    addressCity: text('address_city'),
    addressState: text('address_state'),
    addressZip: text('address_zip'),
    addressFormatted: text('address_formatted'),
    description: text('description'),
    jobTypeName: text('job_type_name'),
    businessUnit: text('business_unit'),
    tags: text('tags').array().notNull().default([]),
    leadSource: text('lead_source'),
    workStatus: text('work_status').notNull().default(''),
    scheduledStart: timestamp('scheduled_start', { withTimezone: true }),
    scheduledEnd: timestamp('scheduled_end', { withTimezone: true }),
    arrivalWindowMin: integer('arrival_window_min'),
    hcpTimeZone: text('hcp_time_zone'),
    onMyWayAt: timestamp('on_my_way_at', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    totalAmountCents: integer('total_amount_cents'),
    outstandingBalanceCents: integer('outstanding_balance_cents'),
    hcpCreatedAt: timestamp('hcp_created_at', { withTimezone: true }),
    hcpUpdatedAt: timestamp('hcp_updated_at', { withTimezone: true }),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    rawJson: jsonb('raw_json').$type<Record<string, unknown>>().notNull(),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('hcp_jobs_scheduled_start_idx').on(t.scheduledStart),
    index('hcp_jobs_work_status_idx').on(t.workStatus),
    index('hcp_jobs_hcp_updated_at_idx').on(t.hcpUpdatedAt),
    index('hcp_jobs_customer_idx').on(t.hcpCustomerId),
  ],
);

export const hcpJobAssignees = pgTable(
  'hcp_job_assignees',
  {
    hcpJobId: text('hcp_job_id')
      .notNull()
      .references(() => hcpJobs.hcpJobId, { onDelete: 'cascade' }),
    technicianId: uuid('technician_id')
      .notNull()
      .references(() => technicians.id),
  },
  (t) => [primaryKey({ columns: [t.hcpJobId, t.technicianId] }), index('hcp_job_assignees_tech_idx').on(t.technicianId)],
);

export const hcpAppointments = pgTable(
  'hcp_appointments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    hcpAppointmentId: text('hcp_appointment_id').notNull().unique(),
    hcpJobId: text('hcp_job_id')
      .notNull()
      .references(() => hcpJobs.hcpJobId, { onDelete: 'cascade' }),
    startAt: timestamp('start_at', { withTimezone: true }),
    endAt: timestamp('end_at', { withTimezone: true }),
    startDate: date('start_date'),
    anytime: boolean('anytime').notNull().default(false),
    arrivalWindowMin: integer('arrival_window_min'),
    dispatchedEmployeeIds: text('dispatched_employee_ids').array().notNull().default([]),
    rawJson: jsonb('raw_json').$type<Record<string, unknown>>().notNull(),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('hcp_appointments_job_idx').on(t.hcpJobId), index('hcp_appointments_start_idx').on(t.startAt)],
);

export const hcpInvoices = pgTable(
  'hcp_invoices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    hcpInvoiceId: text('hcp_invoice_id').notNull().unique(),
    hcpJobId: text('hcp_job_id')
      .notNull()
      .references(() => hcpJobs.hcpJobId, { onDelete: 'cascade' }),
    invoiceNumber: text('invoice_number'),
    status: text('status').notNull().default(''),
    amountCents: integer('amount_cents').notNull().default(0),
    dueAmountCents: integer('due_amount_cents').notNull().default(0),
    dueAt: timestamp('due_at', { withTimezone: true }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    serviceDate: date('service_date'),
    rawJson: jsonb('raw_json').$type<Record<string, unknown>>().notNull(),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('hcp_invoices_job_idx').on(t.hcpJobId)],
);

export const hcpPayments = pgTable(
  'hcp_payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    hcpPaymentId: text('hcp_payment_id').notNull().unique(),
    hcpInvoiceId: text('hcp_invoice_id')
      .notNull()
      .references(() => hcpInvoices.hcpInvoiceId, { onDelete: 'cascade' }),
    hcpJobId: text('hcp_job_id')
      .notNull()
      .references(() => hcpJobs.hcpJobId, { onDelete: 'cascade' }),
    status: text('status'),
    paymentMethod: text('payment_method'),
    amountCents: integer('amount_cents').notNull().default(0),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    rawJson: jsonb('raw_json').$type<Record<string, unknown>>().notNull(),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('hcp_payments_job_idx').on(t.hcpJobId)],
);

export type Technician = typeof technicians.$inferSelect;
export type HcpJobRow = typeof hcpJobs.$inferSelect;
export type NewHcpJobRow = typeof hcpJobs.$inferInsert;
export type NewHcpCustomerRow = typeof hcpCustomers.$inferInsert;
export type NewTechnicianRow = typeof technicians.$inferInsert;
export type NewHcpAppointmentRow = typeof hcpAppointments.$inferInsert;
export type NewHcpInvoiceRow = typeof hcpInvoices.$inferInsert;
export type NewHcpPaymentRow = typeof hcpPayments.$inferInsert;
