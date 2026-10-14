/**
 * Auto-check suggestions derived from Housecall Pro data (PRD section 7). Pure: takes rows,
 * returns per-step suggestions with the evidence the caller sees. Suggestions never submit
 * anything; the caller confirms or overrides, and both values are stored.
 */
import type { AnswerValue } from '@/src/config/checklist-steps';
import type { HcpJobRow } from '@/src/db/schema/hcp';
import { formatApp } from '@/src/lib/time';

export interface AutoCheckSuggestion {
  value: AnswerValue;
  /** One-line, human readable justification. */
  summary: string;
  /** Raw facts shown in the tooltip. */
  evidence: Record<string, string | number | boolean | null>;
  /** Low confidence suggestions render unselected; the caller must pick. */
  confidence: 'high' | 'low';
}

export type AutoCheckMap = Partial<Record<string, AutoCheckSuggestion>>;

export interface AutoCheckInput {
  job: Pick<
    HcpJobRow,
    'hcpJobId' | 'scheduledStart' | 'scheduledEnd' | 'onMyWayAt' | 'startedAt' | 'completedAt' | 'hcpCustomerId'
  >;
  invoices: Array<{ hcpInvoiceId: string; invoiceNumber: string | null; status: string; paidAt: Date | null; dueAmountCents: number }>;
  /** Payments on this job and on the customer's other jobs. */
  payments: Array<{ hcpPaymentId: string; hcpJobId: string; amountCents: number; paidAt: Date | null }>;
  /** Other jobs for the same customer, used for the follow-up check. */
  customerJobs: Array<{ hcpJobId: string; invoiceNumber: string | null; scheduledStart: Date | null; canceledAt: Date | null }>;
}

const EARLY_MINUTES = 30;
const DEPOSIT_CENTS = 100_00;

function minutesBetween(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 60_000);
}

export function computeAutoChecks(input: AutoCheckInput): AutoCheckMap {
  const out: AutoCheckMap = {};
  const { job } = input;

  // Step 1: arrive 30 minutes early. HCP records "started" (and "on my way"), not arrival.
  if (job.scheduledStart && job.startedAt) {
    const lead = minutesBetween(job.scheduledStart, job.startedAt); // positive = started before scheduled start
    const value: AnswerValue = lead >= EARLY_MINUTES ? 'Y' : 'N';
    out.s01 = {
      value,
      confidence: lead >= EARLY_MINUTES || lead < 0 ? 'high' : 'low',
      summary:
        lead >= 0
          ? `Started ${lead} min before the scheduled start (${formatApp(job.startedAt, 'h:mm a')} vs ${formatApp(job.scheduledStart, 'h:mm a')} NJ)`
          : `Started ${-lead} min after the scheduled start (${formatApp(job.startedAt, 'h:mm a')} vs ${formatApp(job.scheduledStart, 'h:mm a')} NJ)`,
      evidence: {
        scheduled_start: job.scheduledStart.toISOString(),
        started_at: job.startedAt.toISOString(),
        on_my_way_at: job.onMyWayAt?.toISOString() ?? null,
        lead_minutes: lead,
        note: 'Housecall Pro records when the tech tapped Start, not arrival.',
      },
    };
  }

  // Step 10: a later job exists for the same customer.
  if (job.scheduledStart) {
    const later = input.customerJobs
      .filter((j) => j.hcpJobId !== job.hcpJobId && !j.canceledAt && j.scheduledStart && j.scheduledStart > job.scheduledStart!)
      .sort((a, b) => a.scheduledStart!.getTime() - b.scheduledStart!.getTime())[0];
    if (later) {
      out.s10 = {
        value: 'Y',
        confidence: 'high',
        summary: `Follow-up job ${later.invoiceNumber ?? later.hcpJobId} scheduled ${formatApp(later.scheduledStart, 'MMM d, yyyy')}`,
        evidence: {
          follow_up_job_id: later.hcpJobId,
          follow_up_invoice_number: later.invoiceNumber,
          follow_up_scheduled_start: later.scheduledStart!.toISOString(),
        },
      };
    }
  }

  // Step 11: $100 deposit collected before the work date (this job or the customer's jobs).
  if (job.scheduledStart) {
    const deposit = input.payments
      .filter((p) => p.paidAt && p.paidAt < job.scheduledStart! && p.amountCents >= DEPOSIT_CENTS)
      .sort((a, b) => b.paidAt!.getTime() - a.paidAt!.getTime())[0];
    if (deposit) {
      out.s11 = {
        value: 'Y',
        confidence: 'high',
        summary: `Payment of $${(deposit.amountCents / 100).toFixed(2)} on ${formatApp(deposit.paidAt, 'MMM d, yyyy')} before the work date`,
        evidence: {
          payment_id: deposit.hcpPaymentId,
          payment_job_id: deposit.hcpJobId,
          amount_cents: deposit.amountCents,
          paid_at: deposit.paidAt!.toISOString(),
        },
      };
    }
  }

  // Step 27: invoiced and charged before departing.
  const liveInvoices = input.invoices.filter((i) => !['voided', 'canceled', 'uncollectible'].includes(i.status));
  if (liveInvoices.length > 0) {
    const paid = liveInvoices.find((i) => i.status === 'paid' || i.dueAmountCents === 0);
    const open = liveInvoices.find((i) => i.status !== 'paid' && i.dueAmountCents > 0);
    if (paid) {
      const paidAt = paid.paidAt;
      const beforeDeparture = paidAt && job.completedAt ? paidAt.getTime() <= job.completedAt.getTime() + 3_600_000 : null;
      out.s27 = {
        value: beforeDeparture === false ? 'N' : 'Y',
        confidence: beforeDeparture === null ? 'low' : 'high',
        summary:
          beforeDeparture === false
            ? `Invoice ${paid.invoiceNumber ?? ''} paid ${formatApp(paidAt, 'MMM d, h:mm a')}, after the job was completed`
            : `Invoice ${paid.invoiceNumber ?? ''} paid${paidAt ? ` ${formatApp(paidAt, 'MMM d, h:mm a')}` : ''}`,
        evidence: {
          invoice_id: paid.hcpInvoiceId,
          invoice_number: paid.invoiceNumber,
          invoice_status: paid.status,
          paid_at: paidAt?.toISOString() ?? null,
          completed_at: job.completedAt?.toISOString() ?? null,
        },
      };
    } else if (open && job.completedAt) {
      out.s27 = {
        value: 'N',
        confidence: 'high',
        summary: `Invoice ${open.invoiceNumber ?? ''} still ${open.status} with $${(open.dueAmountCents / 100).toFixed(2)} due`,
        evidence: {
          invoice_id: open.hcpInvoiceId,
          invoice_number: open.invoiceNumber,
          invoice_status: open.status,
          due_amount_cents: open.dueAmountCents,
          completed_at: job.completedAt.toISOString(),
        },
      };
    }
  }

  // Step 30: departed site.
  if (job.completedAt) {
    out.s30 = {
      value: 'Y',
      confidence: 'high',
      summary: `Job completed ${formatApp(job.completedAt, 'MMM d, h:mm a')} NJ`,
      evidence: { completed_at: job.completedAt.toISOString() },
    };
  }

  return out;
}
