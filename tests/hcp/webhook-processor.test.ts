import { describe, expect, it } from 'vitest';
import { routeWebhookEvent, webhookEntityId, webhookOccurredAt } from '@/src/lib/hcp/webhook-processor';
import type { HcpWebhookPayload } from '@/src/lib/hcp/types';

const base = { company_id: 'c1' } as const;

describe('routeWebhookEvent', () => {
  it('re-fetches the job for job.* events', () => {
    const p = { ...base, event: 'job.completed', job: { id: 'job_1' } } as unknown as HcpWebhookPayload;
    expect(routeWebhookEvent(p)).toEqual({ action: 'sync_job', hcpJobId: 'job_1' });
  });

  it('marks deletions instead of fetching', () => {
    const p = { ...base, event: 'job.deleted', job: { id: 'job_1' } } as unknown as HcpWebhookPayload;
    expect(routeWebhookEvent(p)).toEqual({ action: 'mark_job_deleted', hcpJobId: 'job_1' });
  });

  it('resolves appointment events through the appointment job id', () => {
    const p = {
      ...base,
      event: 'job.appointment.rescheduled',
      appointment: { id: 'apt_1', job_id: 'job_9' },
    } as unknown as HcpWebhookPayload;
    expect(routeWebhookEvent(p)).toEqual({ action: 'sync_job', hcpJobId: 'job_9' });
  });

  it('resolves invoice events to their job', () => {
    const p = { ...base, event: 'invoice.paid', invoice: { id: 'inv_1', job_id: 'job_2' } } as unknown as HcpWebhookPayload;
    expect(routeWebhookEvent(p)).toEqual({ action: 'sync_job', hcpJobId: 'job_2' });
  });

  it('syncs customers on customer events', () => {
    const p = { ...base, event: 'customer.updated', customer: { id: 'cus_1' } } as unknown as HcpWebhookPayload;
    expect(routeWebhookEvent(p)).toEqual({ action: 'sync_customer', hcpCustomerId: 'cus_1' });
  });

  it('ignores estimates, leads and malformed payloads', () => {
    expect(routeWebhookEvent({ ...base, event: 'estimate.sent' } as HcpWebhookPayload).action).toBe('ignore');
    expect(routeWebhookEvent({ ...base, event: 'lead.created' } as HcpWebhookPayload).action).toBe('ignore');
    expect(routeWebhookEvent({ ...base, event: 'job.updated' } as HcpWebhookPayload)).toEqual({
      action: 'ignore',
      reason: 'job.updated without job id',
    });
    expect(routeWebhookEvent({ ...base } as unknown as HcpWebhookPayload).action).toBe('ignore');
  });
});

describe('webhook metadata', () => {
  it('extracts the entity id and the occurred-at under either field name', () => {
    expect(webhookEntityId({ ...base, event: 'invoice.paid', invoice: { id: 'inv_1' } } as unknown as HcpWebhookPayload)).toBe('inv_1');
    expect(webhookOccurredAt({ ...base, event: 'x', event_occurred_at: '2026-10-13T00:00:00Z' })).toBe('2026-10-13T00:00:00Z');
    expect(webhookOccurredAt({ ...base, event: 'x', event_created_at: '2026-10-14T00:00:00Z' })).toBe('2026-10-14T00:00:00Z');
    expect(webhookOccurredAt({ ...base, event: 'x' })).toBeUndefined();
  });
});
