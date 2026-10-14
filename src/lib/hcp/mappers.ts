/**
 * Pure mappers from Housecall Pro API objects to database rows. No I/O here.
 *
 * Timestamp policy (docs/reference/housecall-pro-api.md): `schedule.scheduled_start/end` are
 * documented as UTC. `work_timestamps.*`, appointment times and created/updated are undocumented and
 * sometimes naive ("2023-03-23T15:30:00"). Naive values are read as UTC until the day-1 check
 * against a real job says otherwise; that is isolated in `parseHcpTimestamp`.
 */
import type {
  NewHcpAppointmentRow,
  NewHcpCustomerRow,
  NewHcpInvoiceRow,
  NewHcpJobRow,
  NewHcpPaymentRow,
  NewTechnicianRow,
} from '@/src/db/schema/hcp';
import type { HcpAppointment, HcpCustomer, HcpEmployee, HcpInvoice, HcpJob, HcpPayment } from './types';

const OFFSET_RE = /(Z|[+-]\d{2}:?\d{2})$/i;
const NAIVE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseHcpTimestamp(value: string | null | undefined): Date | null {
  if (!value) return null;
  const s = value.trim();
  if (!s) return null;
  let iso = s;
  if (NAIVE_RE.test(s)) iso = `${s}Z`;
  else if (DATE_ONLY_RE.test(s)) iso = `${s}T00:00:00Z`;
  else if (!OFFSET_RE.test(s) && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s)) iso = `${s.replace(' ', 'T')}Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function hcpDateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  const s = value.trim();
  if (DATE_ONLY_RE.test(s)) return s;
  const m = /^(\d{4}-\d{2}-\d{2})T/.exec(s);
  return m ? m[1] : null;
}

/** HCP money fields are integers; treated as cents (inferred, see reference doc). */
export function toCents(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return (value ?? {}) as Record<string, unknown>;
}

export function customerDisplayName(c: Pick<HcpCustomer, 'first_name' | 'last_name' | 'company'> | null | undefined) {
  if (!c) return '';
  const person = [c.first_name, c.last_name].filter(Boolean).join(' ').trim();
  if (person && c.company) return `${person} (${c.company})`;
  return person || c.company || '';
}

export function formatAddress(a: HcpJob['address']): string | null {
  if (!a) return null;
  const line1 = [a.street, a.street_line_2].filter(Boolean).join(', ');
  const cityState = [a.city, a.state].filter(Boolean).join(', ');
  const tail = [cityState, a.zip].filter(Boolean).join(' ');
  const out = [line1, tail].filter(Boolean).join(', ');
  return out || null;
}

export function isTechnicianRole(role: string | null | undefined): boolean {
  if (!role) return true;
  return /tech|field|install|service/i.test(role);
}

export function mapEmployee(e: HcpEmployee, now = new Date()): NewTechnicianRow {
  return {
    hcpEmployeeId: e.id,
    firstName: e.first_name ?? '',
    lastName: e.last_name ?? '',
    email: e.email ?? null,
    mobile: e.mobile_number ?? null,
    colorHex: e.color_hex ?? null,
    hcpRole: e.role ?? null,
    isTechnician: isTechnicianRole(e.role),
    rawJson: asRecord(e),
    syncedAt: now,
  };
}

export function mapCustomer(c: HcpCustomer, now = new Date()): NewHcpCustomerRow {
  return {
    hcpCustomerId: c.id,
    firstName: c.first_name ?? '',
    lastName: c.last_name ?? '',
    company: c.company ?? null,
    email: c.email ?? null,
    mobile: c.mobile_number ?? null,
    tags: c.tags ?? [],
    rawJson: asRecord(c),
    hcpUpdatedAt: parseHcpTimestamp(c.updated_at),
    syncedAt: now,
  };
}

export function mapJob(j: HcpJob, now = new Date()): NewHcpJobRow {
  const a = j.address;
  return {
    hcpJobId: j.id,
    invoiceNumber: j.invoice_number ?? null,
    hcpCustomerId: j.customer?.id ?? null,
    customerName: customerDisplayName(j.customer),
    addressLine1: a?.street ?? null,
    addressLine2: a?.street_line_2 ?? null,
    addressCity: a?.city ?? null,
    addressState: a?.state ?? null,
    addressZip: a?.zip ?? null,
    addressFormatted: formatAddress(a),
    description: j.description ?? null,
    jobTypeName: j.job_fields?.job_type?.name ?? null,
    businessUnit: j.job_fields?.business_unit?.name ?? null,
    tags: j.tags ?? [],
    leadSource: j.lead_source ?? null,
    workStatus: j.work_status ?? '',
    scheduledStart: parseHcpTimestamp(j.schedule?.scheduled_start),
    scheduledEnd: parseHcpTimestamp(j.schedule?.scheduled_end),
    arrivalWindowMin: j.schedule?.arrival_window ?? null,
    hcpTimeZone: j.schedule?.time_zone ?? null,
    onMyWayAt: parseHcpTimestamp(j.work_timestamps?.on_my_way_at),
    startedAt: parseHcpTimestamp(j.work_timestamps?.started_at),
    completedAt: parseHcpTimestamp(j.work_timestamps?.completed_at),
    totalAmountCents: toCents(j.total_amount),
    outstandingBalanceCents: toCents(j.outstanding_balance),
    hcpCreatedAt: parseHcpTimestamp(j.created_at),
    hcpUpdatedAt: parseHcpTimestamp(j.updated_at),
    canceledAt: parseHcpTimestamp(j.canceled_at),
    deletedAt: parseHcpTimestamp(j.deleted_at),
    rawJson: asRecord(j),
    syncedAt: now,
  };
}

export function mapAppointment(ap: HcpAppointment, hcpJobId: string, now = new Date()): NewHcpAppointmentRow {
  return {
    hcpAppointmentId: ap.id,
    hcpJobId,
    startAt: parseHcpTimestamp(ap.start_time),
    endAt: parseHcpTimestamp(ap.end_time),
    startDate: hcpDateOnly(ap.start_date ?? ap.start_time),
    anytime: Boolean(ap.anytime),
    arrivalWindowMin: ap.arrival_window_minutes ?? null,
    dispatchedEmployeeIds: ap.dispatched_employees_ids ?? [],
    rawJson: asRecord(ap),
    syncedAt: now,
  };
}

export function mapInvoice(inv: HcpInvoice, hcpJobId: string, now = new Date()): NewHcpInvoiceRow {
  return {
    hcpInvoiceId: inv.id,
    hcpJobId,
    invoiceNumber: inv.invoice_number ?? null,
    status: inv.status ?? '',
    amountCents: toCents(inv.amount) ?? 0,
    dueAmountCents: toCents(inv.due_amount) ?? 0,
    dueAt: parseHcpTimestamp(inv.due_at),
    paidAt: parseHcpTimestamp(inv.paid_at),
    sentAt: parseHcpTimestamp(inv.sent_at),
    serviceDate: hcpDateOnly(inv.service_date),
    rawJson: asRecord(inv),
    syncedAt: now,
  };
}

export function mapPayment(p: HcpPayment, hcpInvoiceId: string, hcpJobId: string, now = new Date()): NewHcpPaymentRow {
  return {
    hcpPaymentId: p.id,
    hcpInvoiceId,
    hcpJobId,
    status: p.status ?? null,
    paymentMethod: p.payment_method ?? null,
    amountCents: toCents(p.amount) ?? 0,
    paidAt: parseHcpTimestamp(p.paid_at),
    rawJson: asRecord(p),
    syncedAt: now,
  };
}
