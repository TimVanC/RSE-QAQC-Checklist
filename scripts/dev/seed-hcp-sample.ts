/**
 * Development only: load a realistic set of Housecall Pro-shaped jobs into the database through
 * the real sync upserts, so the call queue and checklists can be built and demoed before the
 * HCP_API_KEY exists. Safe to re-run (idempotent upserts). Never run against production.
 *
 *   npm run dev:seed-hcp
 */
import { upsertEmployees, upsertJobBundle, withSyncRun } from '../../src/lib/hcp/sync';
import type { HcpEmployee, HcpInvoice, HcpJob } from '../../src/lib/hcp/types';
import { addDays, appDayRange, todayAppDate } from '../../src/lib/time';

const EMPLOYEES: HcpEmployee[] = [
  { id: 'emp_sample_1', first_name: 'Marcus', last_name: 'Rivera', email: 'marcus@example.com', mobile_number: '2015550101', color_hex: '#2563eb', role: 'field tech' },
  { id: 'emp_sample_2', first_name: 'Dana', last_name: 'Okafor', email: 'dana@example.com', mobile_number: '2015550102', color_hex: '#16a34a', role: 'field tech' },
  { id: 'emp_sample_3', first_name: 'Luis', last_name: 'Ferreira', email: 'luis@example.com', mobile_number: '2015550103', color_hex: '#ea580c', role: 'field tech' },
  { id: 'emp_sample_4', first_name: 'Priya', last_name: 'Natarajan', email: 'priya@example.com', mobile_number: '2015550104', color_hex: '#9333ea', role: 'field tech' },
  { id: 'emp_sample_5', first_name: 'Kevin', last_name: 'Walsh', email: 'kevin@example.com', mobile_number: '2015550105', color_hex: '#dc2626', role: 'field tech' },
  { id: 'emp_sample_6', first_name: 'Relene', last_name: 'Santos', email: 'relene@example.com', mobile_number: null, color_hex: '#64748b', role: 'office staff' },
];

const CUSTOMERS = [
  { id: 'cus_sample_1', first_name: 'Harold', last_name: 'Benson', company: null, street: '12 Maple Ave', city: 'Montclair', zip: '07042' },
  { id: 'cus_sample_2', first_name: 'Grace', last_name: 'Kim', company: null, street: '88 Ridge Rd', city: 'Verona', zip: '07044' },
  { id: 'cus_sample_3', first_name: 'Omar', last_name: 'Haddad', company: 'Haddad Deli', street: '301 Bloomfield Ave', city: 'Caldwell', zip: '07006' },
  { id: 'cus_sample_4', first_name: 'Nina', last_name: 'Petrov', company: null, street: '5 Linden Ct', city: 'West Orange', zip: '07052' },
  { id: 'cus_sample_5', first_name: 'Tom', last_name: 'Alvarez', company: null, street: '47 Prospect St', city: 'Nutley', zip: '07110' },
  { id: 'cus_sample_6', first_name: 'Beatrice', last_name: 'Long', company: null, street: '9 Elm St', city: 'Glen Ridge', zip: '07028' },
  { id: 'cus_sample_7', first_name: 'Sam', last_name: 'Ortiz', company: 'Ortiz Properties LLC', street: '220 Main St', city: 'Belleville', zip: '07109' },
  { id: 'cus_sample_8', first_name: 'Judy', last_name: 'Chen', company: null, street: '14 Oak Ln', city: 'Livingston', zip: '07039' },
];

const JOB_TYPES = ['HVAC Service Call', 'HVAC Install', 'Water Heater Replacement', 'Generator Maintenance', 'Boiler Repair', 'Estimate'];

type Spec = {
  n: number;
  dayOffset: number;
  hour: number;
  durationH: number;
  tech: number;
  customer: number;
  jobType: number;
  status: 'scheduled' | 'in progress' | 'complete rated' | 'complete unrated' | 'user canceled';
  amount: number;
  paid?: boolean;
  tags?: string[];
  secondTech?: number;
  description: string;
};

const SPECS: Spec[] = [
  { n: 1, dayOffset: -2, hour: 8, durationH: 2, tech: 0, customer: 0, jobType: 0, status: 'complete rated', amount: 28500, paid: true, description: 'No cooling, condenser fan not spinning' },
  { n: 2, dayOffset: -2, hour: 11, durationH: 3, tech: 1, customer: 1, jobType: 2, status: 'complete unrated', amount: 215000, paid: true, tags: ['Permit'], description: '50 gal gas water heater replacement' },
  { n: 3, dayOffset: -2, hour: 14, durationH: 2, tech: 2, customer: 2, jobType: 3, status: 'complete rated', amount: 32000, paid: false, tags: ['PM Program'], description: 'Annual generator maintenance' },
  { n: 4, dayOffset: -1, hour: 8, durationH: 4, tech: 0, customer: 3, jobType: 1, status: 'complete unrated', amount: 890000, paid: false, tags: ['Permit', 'Financing'], secondTech: 3, description: 'Heat pump install, day 1 of 2' },
  { n: 5, dayOffset: -1, hour: 9, durationH: 2, tech: 1, customer: 4, jobType: 0, status: 'complete rated', amount: 19500, paid: true, description: 'Thermostat not calling for heat' },
  { n: 6, dayOffset: -1, hour: 13, durationH: 2, tech: 4, customer: 5, jobType: 4, status: 'user canceled', amount: 0, description: 'Boiler leaking at relief valve' },
  { n: 7, dayOffset: -1, hour: 15, durationH: 1, tech: 2, customer: 6, jobType: 5, status: 'complete rated', amount: 0, description: 'Estimate for ductless mini split' },
  { n: 8, dayOffset: 0, hour: 8, durationH: 4, tech: 0, customer: 3, jobType: 1, status: 'in progress', amount: 890000, paid: false, tags: ['Permit', 'Financing'], secondTech: 3, description: 'Heat pump install, day 2 of 2' },
  { n: 9, dayOffset: 0, hour: 9, durationH: 2, tech: 1, customer: 7, jobType: 0, status: 'in progress', amount: 24000, description: 'Furnace short cycling' },
  { n: 10, dayOffset: 0, hour: 10, durationH: 2, tech: 2, customer: 0, jobType: 0, status: 'scheduled', amount: 0, tags: ['Call Back'], description: 'Callback: condenser noise after repair' },
  { n: 11, dayOffset: 0, hour: 13, durationH: 3, tech: 4, customer: 2, jobType: 4, status: 'scheduled', amount: 46000, description: 'Boiler circulator pump replacement' },
  { n: 12, dayOffset: 0, hour: 14, durationH: 2, tech: 1, customer: 1, jobType: 0, status: 'scheduled', amount: 0, tags: ['PM Program'], description: 'PM visit: AC tune-up' },
  { n: 13, dayOffset: 1, hour: 8, durationH: 2, tech: 2, customer: 4, jobType: 3, status: 'scheduled', amount: 32000, description: 'Generator load test' },
  { n: 14, dayOffset: 1, hour: 9, durationH: 5, tech: 4, customer: 6, jobType: 2, status: 'scheduled', amount: 268000, tags: ['Permit'], description: 'Tankless water heater install' },
  { n: 15, dayOffset: 1, hour: 11, durationH: 2, tech: 0, customer: 5, jobType: 0, status: 'scheduled', amount: 0, description: 'No heat, second floor' },
  { n: 16, dayOffset: 2, hour: 8, durationH: 2, tech: 3, customer: 7, jobType: 0, status: 'scheduled', amount: 0, description: 'Humidifier not running' },
];

function at(dayOffset: number, hour: number, minute = 0): Date {
  const date = addDays(todayAppDate(), dayOffset);
  const { start } = appDayRange(date);
  return new Date(start.getTime() + hour * 3_600_000 + minute * 60_000);
}

function iso(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

function buildJob(s: Spec): { job: HcpJob; invoices: HcpInvoice[] } {
  const c = CUSTOMERS[s.customer];
  const start = at(s.dayOffset, s.hour);
  const end = new Date(start.getTime() + s.durationH * 3_600_000);
  const done = s.status.startsWith('complete');
  const started = s.status === 'in progress' || done ? new Date(start.getTime() - 10 * 60_000) : null;
  const completed = done ? new Date(end.getTime() + 15 * 60_000) : null;
  const techs = [EMPLOYEES[s.tech], ...(s.secondTech != null ? [EMPLOYEES[s.secondTech]] : [])];
  const id = `job_sample_${String(s.n).padStart(2, '0')}`;
  const updatedAt = completed ?? started ?? new Date(start.getTime() - 24 * 3_600_000);
  const job: HcpJob = {
    id,
    invoice_number: String(1000 + s.n),
    description: s.description,
    customer: { id: c.id, first_name: c.first_name, last_name: c.last_name, email: null, mobile_number: null, company: c.company },
    address: { street: c.street, street_line_2: null, city: c.city, state: 'NJ', zip: c.zip },
    work_status: s.status,
    work_timestamps: { on_my_way_at: iso(started ? new Date(started.getTime() - 25 * 60_000) : null), started_at: iso(started), completed_at: iso(completed) },
    schedule: {
      scheduled_start: start.toISOString(),
      scheduled_end: end.toISOString(),
      arrival_window: 60,
      time_zone: 'America/New_York',
      appointments: [
        { id: `apt_${id}`, start_date: todayAppDate(start), start_time: start.toISOString(), end_time: end.toISOString(), arrival_window_minutes: 60, dispatched_employees_ids: techs.map((t) => t.id) },
      ],
    },
    total_amount: s.amount,
    outstanding_balance: s.paid ? 0 : s.amount,
    assigned_employees: techs,
    tags: s.tags ?? [],
    job_fields: { job_type: { id: `jt_${s.jobType}`, name: JOB_TYPES[s.jobType] } },
    created_at: new Date(start.getTime() - 3 * 24 * 3_600_000).toISOString(),
    updated_at: updatedAt.toISOString(),
    canceled_at: s.status === 'user canceled' ? iso(new Date(start.getTime() - 2 * 3_600_000)) : null,
  };
  const invoices: HcpInvoice[] = [];
  if (s.amount > 0 && done) {
    invoices.push({
      id: `inv_${id}`,
      job_id: id,
      status: s.paid ? 'paid' : 'open',
      invoice_number: job.invoice_number,
      amount: s.amount,
      due_amount: s.paid ? 0 : s.amount,
      due_at: iso(new Date(end.getTime() + 14 * 24 * 3_600_000)),
      paid_at: s.paid ? iso(new Date(completed!.getTime() + 5 * 60_000)) : null,
      sent_at: iso(completed),
      service_date: todayAppDate(start),
      payments: s.paid
        ? [{ id: `pay_${id}`, status: 'succeeded', payment_method: 'credit_card', amount: s.amount, paid_at: iso(new Date(completed!.getTime() + 5 * 60_000)) }]
        : [],
    });
  }
  return { job, invoices };
}

async function main() {
  if (process.env.VERCEL_ENV === 'production') throw new Error('refusing to seed sample data in production');
  const { getDb } = await import('../../src/db');
  const db = getDb();
  const deps = { db, hcp: null as never, log: console.log };
  const result = await withSyncRun(deps, { kind: 'manual', trigger: 'dev-seed' }, async (counts) => {
    const now = new Date();
    counts.bump('employees', await upsertEmployees(db, EMPLOYEES, now));
    for (const spec of SPECS) {
      const { job, invoices } = buildJob(spec);
      await upsertJobBundle(db, job, invoices, now, counts);
    }
  });
  console.log(result);
  if (result.status !== 'ok') process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
