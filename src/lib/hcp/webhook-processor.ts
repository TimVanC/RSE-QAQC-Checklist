/**
 * Webhook intake: store every delivery in `webhook_events` (deduplicated), then act on it by
 * re-fetching the entity from the API. The payload is kept for forensics; the API is the source
 * of truth so out-of-order deliveries cannot regress data.
 */
import 'server-only';
import { and, eq, inArray, lt, or, sql } from 'drizzle-orm';
import type { Db } from '@/src/db';
import { hcpCustomers } from '@/src/db/schema/hcp';
import { webhookEvents, type WebhookEvent } from '@/src/db/schema/system';
import { mapCustomer, parseHcpTimestamp } from './mappers';
import { markJobDeleted, syncSingleJob, type SyncCounts, type SyncDeps } from './sync';
import type { HcpWebhookPayload } from './types';
import { webhookDedupeKey } from './webhooks';

export const MAX_WEBHOOK_ATTEMPTS = 5;

export type WebhookRoute =
  | { action: 'sync_job'; hcpJobId: string }
  | { action: 'mark_job_deleted'; hcpJobId: string }
  | { action: 'sync_customer'; hcpCustomerId: string }
  | { action: 'ignore'; reason: string };

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

/** Decide what a payload means for us. Pure. */
export function routeWebhookEvent(payload: HcpWebhookPayload): WebhookRoute {
  const event = str(payload.event) ?? '';
  const jobId = str(payload.job?.id) ?? str(payload.appointment?.job_id) ?? str((payload as { job_id?: unknown }).job_id);

  if (event === 'job.deleted') {
    return jobId ? { action: 'mark_job_deleted', hcpJobId: jobId } : { action: 'ignore', reason: 'job.deleted without job id' };
  }
  if (event.startsWith('job.')) {
    return jobId ? { action: 'sync_job', hcpJobId: jobId } : { action: 'ignore', reason: `${event} without job id` };
  }
  if (event.startsWith('invoice.')) {
    const invoiceJob = str(payload.invoice?.job_id) ?? jobId;
    return invoiceJob ? { action: 'sync_job', hcpJobId: invoiceJob } : { action: 'ignore', reason: `${event} without job id` };
  }
  if (event.startsWith('customer.')) {
    const customerId = str(payload.customer?.id);
    return customerId
      ? { action: 'sync_customer', hcpCustomerId: customerId }
      : { action: 'ignore', reason: `${event} without customer id` };
  }
  return { action: 'ignore', reason: event ? `unhandled event ${event}` : 'missing event name' };
}

export function webhookEntityId(payload: HcpWebhookPayload): string | undefined {
  return (
    str(payload.job?.id) ??
    str(payload.invoice?.id) ??
    str(payload.customer?.id) ??
    str(payload.appointment?.id) ??
    undefined
  );
}

export function webhookOccurredAt(payload: HcpWebhookPayload): string | undefined {
  return str(payload.event_occurred_at) ?? str(payload.event_created_at);
}

export interface StoredWebhook {
  isNew: boolean;
  event: WebhookEvent | null;
}

/**
 * Insert the delivery. A repeat of the same event returns isNew=false; if that earlier copy is still
 * pending or failed (under the attempt cap) it is returned so the caller can retry it now, since
 * Housecall Pro's own re-delivery is the fastest retry path we have.
 */
export async function storeWebhookEvent(db: Db, payload: HcpWebhookPayload): Promise<StoredWebhook> {
  const event = str(payload.event) ?? 'unknown';
  const entityId = webhookEntityId(payload);
  const occurredAt = webhookOccurredAt(payload);
  const dedupeKey = webhookDedupeKey(event, entityId, occurredAt);
  const [row] = await db
    .insert(webhookEvents)
    .values({
      event,
      dedupeKey,
      hcpEntityId: entityId ?? null,
      occurredAt: parseHcpTimestamp(occurredAt),
      payload: payload as unknown as Record<string, unknown>,
      status: 'pending',
    })
    .onConflictDoNothing({ target: webhookEvents.dedupeKey })
    .returning();
  if (row) return { isNew: true, event: row };
  const [earlier] = await db.select().from(webhookEvents).where(eq(webhookEvents.dedupeKey, dedupeKey)).limit(1);
  const retryable =
    earlier && (earlier.status === 'pending' || (earlier.status === 'failed' && earlier.attempts < MAX_WEBHOOK_ATTEMPTS));
  return { isNew: false, event: retryable ? earlier : null };
}

export type ProcessOutcome = 'processed' | 'skipped' | 'failed';

/** Act on one stored event and record the outcome. Never throws. */
export async function processWebhookEvent(deps: SyncDeps, event: WebhookEvent, counts?: SyncCounts): Promise<ProcessOutcome> {
  const now = deps.now?.() ?? new Date();
  const payload = event.payload as unknown as HcpWebhookPayload;
  const route = routeWebhookEvent(payload);
  const bump = (k: string) => {
    if (counts) counts[k] = (counts[k] ?? 0) + 1;
  };

  // Count the attempt before doing the work so an event that kills the function cannot retry forever.
  await deps.db
    .update(webhookEvents)
    .set({ attempts: sql`${webhookEvents.attempts} + 1` })
    .where(eq(webhookEvents.id, event.id));

  let outcome: ProcessOutcome = 'processed';
  let error: string | null = null;
  try {
    switch (route.action) {
      case 'sync_job':
        await syncSingleJob(deps, route.hcpJobId);
        break;
      case 'mark_job_deleted':
        await markJobDeleted(deps.db, route.hcpJobId, now);
        break;
      case 'sync_customer': {
        const c = await deps.hcp.customer(route.hcpCustomerId);
        const row = mapCustomer(c, now);
        await deps.db.insert(hcpCustomers).values(row).onConflictDoUpdate({ target: hcpCustomers.hcpCustomerId, set: row });
        break;
      }
      case 'ignore':
        outcome = 'skipped';
        error = route.reason;
        break;
    }
  } catch (err) {
    outcome = 'failed';
    error = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    deps.log?.('[webhook] processing failed', { eventId: event.id, event: event.event, error });
  }

  await deps.db
    .update(webhookEvents)
    .set({
      status: outcome,
      processedAt: outcome === 'failed' ? null : now,
      error,
    })
    .where(eq(webhookEvents.id, event.id));
  bump(`webhook_${outcome}`);
  return outcome;
}

/** Retry pending and failed events (bounded attempts). Called by the reconcile cron. */
export async function processPendingWebhooks(deps: SyncDeps, counts?: SyncCounts, limit = 50): Promise<number> {
  const rows = await deps.db
    .select()
    .from(webhookEvents)
    .where(
      and(
        or(eq(webhookEvents.status, 'pending'), eq(webhookEvents.status, 'failed')),
        lt(webhookEvents.attempts, MAX_WEBHOOK_ATTEMPTS),
      ),
    )
    .orderBy(webhookEvents.receivedAt)
    .limit(limit);
  for (const row of rows) await processWebhookEvent(deps, row, counts);
  return rows.length;
}

export async function countPendingWebhooks(db: Db): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(webhookEvents)
    .where(inArray(webhookEvents.status, ['pending', 'failed']));
  return row?.n ?? 0;
}
