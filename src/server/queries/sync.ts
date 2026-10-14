import 'server-only';
import { desc, eq, sql } from 'drizzle-orm';
import { getDb } from '@/src/db';
import { hcpCustomers, hcpInvoices, hcpJobs, technicians } from '@/src/db/schema/hcp';
import { syncRuns, webhookEvents } from '@/src/db/schema/system';
import { hcpConfigured } from '@/src/lib/hcp/deps';
import { countPendingWebhooks } from '@/src/lib/hcp/webhook-processor';

const LIST_LIMIT = 25;

export interface SyncRunView {
  id: string;
  kind: 'reconcile' | 'backfill' | 'webhook' | 'manual' | 'employees';
  trigger: string;
  status: 'running' | 'ok' | 'error';
  startedAt: Date;
  finishedAt: Date | null;
  /** finishedAt - startedAt in milliseconds; null while the run is still open. */
  durationMs: number | null;
  counts: Record<string, number>;
  error: string | null;
}

export interface WebhookEventView {
  id: string;
  event: string;
  status: 'pending' | 'processed' | 'failed' | 'skipped';
  attempts: number;
  receivedAt: Date;
  error: string | null;
}

export interface SyncOverview {
  hcpConfigured: boolean;
  /** Newest first, at most 25. */
  runs: SyncRunView[];
  /** Most recent run with status 'ok', even when it is older than the 25 listed runs. */
  lastOkRun: SyncRunView | null;
  counts: {
    jobs: number;
    technicians: number;
    /** Technicians with is_technician = true (the people who appear in the call queue). */
    techniciansFlagged: number;
    customers: number;
    invoices: number;
  };
  /** Webhook events still pending or failed. */
  pendingWebhooks: number;
  /** Newest first, at most 25. The raw payload is deliberately not loaded. */
  webhookEvents: WebhookEventView[];
}

function toRunView(row: typeof syncRuns.$inferSelect): SyncRunView {
  return {
    id: row.id,
    kind: row.kind,
    trigger: row.trigger,
    status: row.status,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    durationMs: row.finishedAt ? Math.max(0, row.finishedAt.getTime() - row.startedAt.getTime()) : null,
    counts: row.counts ?? {},
    error: row.error,
  };
}

async function countRows(table: typeof hcpJobs | typeof hcpCustomers | typeof hcpInvoices): Promise<number> {
  const [row] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(table);
  return row?.n ?? 0;
}

/** Everything the admin Sync page shows. Read-only; safe to call without Housecall Pro configured. */
export async function getSyncOverview(): Promise<SyncOverview> {
  const db = getDb();

  const [runRows, lastOkRows, eventRows, jobs, customers, invoices, techRows, pendingWebhooks] = await Promise.all([
    db.select().from(syncRuns).orderBy(desc(syncRuns.startedAt)).limit(LIST_LIMIT),
    db.select().from(syncRuns).where(eq(syncRuns.status, 'ok')).orderBy(desc(syncRuns.startedAt)).limit(1),
    db
      .select({
        id: webhookEvents.id,
        event: webhookEvents.event,
        status: webhookEvents.status,
        attempts: webhookEvents.attempts,
        receivedAt: webhookEvents.receivedAt,
        error: webhookEvents.error,
      })
      .from(webhookEvents)
      .orderBy(desc(webhookEvents.receivedAt))
      .limit(LIST_LIMIT),
    countRows(hcpJobs),
    countRows(hcpCustomers),
    countRows(hcpInvoices),
    db
      .select({
        total: sql<number>`count(*)::int`,
        flagged: sql<number>`(count(*) filter (where ${technicians.isTechnician}))::int`,
      })
      .from(technicians),
    countPendingWebhooks(db),
  ]);

  return {
    hcpConfigured: hcpConfigured(),
    runs: runRows.map(toRunView),
    lastOkRun: lastOkRows[0] ? toRunView(lastOkRows[0]) : null,
    counts: {
      jobs,
      technicians: techRows[0]?.total ?? 0,
      techniciansFlagged: techRows[0]?.flagged ?? 0,
      customers,
      invoices,
    },
    pendingWebhooks,
    webhookEvents: eventRows,
  };
}
