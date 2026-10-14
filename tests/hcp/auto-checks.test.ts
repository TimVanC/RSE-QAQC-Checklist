import { describe, expect, it } from 'vitest';
import { computeAutoChecks, type AutoCheckInput } from '@/src/lib/hcp/auto-checks';

const T = (s: string) => new Date(s);

function base(overrides: Partial<AutoCheckInput['job']> = {}): AutoCheckInput {
  return {
    job: {
      hcpJobId: 'job_1',
      scheduledStart: T('2026-07-06T13:00:00Z'),
      scheduledEnd: T('2026-07-06T15:00:00Z'),
      onMyWayAt: null,
      startedAt: null,
      completedAt: null,
      hcpCustomerId: 'cus_1',
      ...overrides,
    },
    invoices: [],
    payments: [],
    customerJobs: [],
  };
}

describe('step 1: arrive 30 minutes early', () => {
  it('suggests Y when started at least 30 minutes before the scheduled start', () => {
    const r = computeAutoChecks(base({ startedAt: T('2026-07-06T12:25:00Z') }));
    expect(r.s01?.value).toBe('Y');
    expect(r.s01?.confidence).toBe('high');
    expect(r.s01?.evidence.lead_minutes).toBe(35);
  });

  it('suggests N with low confidence when started early but under 30 minutes', () => {
    const r = computeAutoChecks(base({ startedAt: T('2026-07-06T12:50:00Z') }));
    expect(r.s01?.value).toBe('N');
    expect(r.s01?.confidence).toBe('low');
  });

  it('suggests N with high confidence when started late', () => {
    const r = computeAutoChecks(base({ startedAt: T('2026-07-06T13:20:00Z') }));
    expect(r.s01).toMatchObject({ value: 'N', confidence: 'high' });
    expect(r.s01?.summary).toContain('after');
  });

  it('says nothing without a start time', () => {
    expect(computeAutoChecks(base()).s01).toBeUndefined();
  });
});

describe('step 10: follow-up job', () => {
  it('suggests Y from a later non-canceled job of the same customer', () => {
    const input = base();
    input.customerJobs = [
      { hcpJobId: 'job_0', invoiceNumber: '900', scheduledStart: T('2026-07-01T13:00:00Z'), canceledAt: null },
      { hcpJobId: 'job_2', invoiceNumber: '1010', scheduledStart: T('2026-07-11T13:00:00Z'), canceledAt: T('2026-07-02T00:00:00Z') },
      { hcpJobId: 'job_3', invoiceNumber: '1011', scheduledStart: T('2026-07-13T13:00:00Z'), canceledAt: null },
    ];
    const r = computeAutoChecks(input);
    expect(r.s10?.value).toBe('Y');
    expect(r.s10?.evidence.follow_up_job_id).toBe('job_3');
  });

  it('says nothing when there is no later job', () => {
    const input = base();
    input.customerJobs = [{ hcpJobId: 'job_0', invoiceNumber: null, scheduledStart: T('2026-07-01T13:00:00Z'), canceledAt: null }];
    expect(computeAutoChecks(input).s10).toBeUndefined();
  });
});

describe('step 11: deposit', () => {
  it('suggests Y for a payment of at least $100 before the work date', () => {
    const input = base();
    input.payments = [
      { hcpPaymentId: 'p1', hcpJobId: 'job_1', amountCents: 5000, paidAt: T('2026-07-01T00:00:00Z') },
      { hcpPaymentId: 'p2', hcpJobId: 'job_0', amountCents: 10000, paidAt: T('2026-07-02T00:00:00Z') },
      { hcpPaymentId: 'p3', hcpJobId: 'job_1', amountCents: 20000, paidAt: T('2026-07-06T16:00:00Z') },
    ];
    const r = computeAutoChecks(input);
    expect(r.s11?.value).toBe('Y');
    expect(r.s11?.evidence.payment_id).toBe('p2');
  });
});

describe('step 27: invoice charged before departing', () => {
  it('suggests Y when the invoice was paid by completion', () => {
    const input = base({ completedAt: T('2026-07-06T15:10:00Z') });
    input.invoices = [{ hcpInvoiceId: 'i1', invoiceNumber: '1001', status: 'paid', paidAt: T('2026-07-06T15:05:00Z'), dueAmountCents: 0 }];
    expect(computeAutoChecks(input).s27).toMatchObject({ value: 'Y', confidence: 'high' });
  });

  it('suggests N when the invoice was paid well after completion', () => {
    const input = base({ completedAt: T('2026-07-06T15:10:00Z') });
    input.invoices = [{ hcpInvoiceId: 'i1', invoiceNumber: '1001', status: 'paid', paidAt: T('2026-07-08T15:05:00Z'), dueAmountCents: 0 }];
    expect(computeAutoChecks(input).s27).toMatchObject({ value: 'N', confidence: 'high' });
  });

  it('suggests N when the invoice is still open after completion', () => {
    const input = base({ completedAt: T('2026-07-06T15:10:00Z') });
    input.invoices = [{ hcpInvoiceId: 'i1', invoiceNumber: '1001', status: 'open', paidAt: null, dueAmountCents: 28500 }];
    const r = computeAutoChecks(input);
    expect(r.s27?.value).toBe('N');
    expect(r.s27?.summary).toContain('285.00');
  });

  it('is low confidence when paid but completion time is unknown', () => {
    const input = base();
    input.invoices = [{ hcpInvoiceId: 'i1', invoiceNumber: '1001', status: 'paid', paidAt: null, dueAmountCents: 0 }];
    expect(computeAutoChecks(input).s27).toMatchObject({ value: 'Y', confidence: 'low' });
  });
});

describe('step 30: departed', () => {
  it('suggests Y when the job has a completion time', () => {
    expect(computeAutoChecks(base({ completedAt: T('2026-07-06T15:10:00Z') })).s30?.value).toBe('Y');
    expect(computeAutoChecks(base()).s30).toBeUndefined();
  });
});
