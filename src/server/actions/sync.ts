'use server';

import { revalidatePath } from 'next/cache';
import { ForbiddenError, UnauthenticatedError, requireRole } from '@/src/lib/auth/session';
import { getSyncDeps, hcpConfigured } from '@/src/lib/hcp/deps';
import { runBackfill, runReconcile, type RunResult } from '@/src/lib/hcp/sync';
import { processPendingWebhooks } from '@/src/lib/hcp/webhook-processor';

export type SyncActionResult = { ok: boolean; message: string };

const NOT_CONFIGURED: SyncActionResult = {
  ok: false,
  message: 'HCP_API_KEY is not set; connect Housecall Pro first.',
};

const MAX_MESSAGE_CHARS = 300;

function clip(text: string): string {
  return text.length > MAX_MESSAGE_CHARS ? `${text.slice(0, MAX_MESSAGE_CHARS - 1)}…` : text;
}

function formatCounts(counts: Record<string, number>, max = 8): string {
  const entries = Object.entries(counts).filter(([, n]) => n > 0);
  if (entries.length === 0) return 'no changes';
  const shown = entries
    .slice(0, max)
    .map(([k, n]) => `${k}=${n}`)
    .join(', ');
  return entries.length > max ? `${shown}, +${entries.length - max} more` : shown;
}

function formatDuration(ms: number): string {
  return ms < 10_000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms / 1000)}s`;
}

function summariseRun(label: string, result: RunResult): SyncActionResult {
  if (result.status === 'ok') {
    return { ok: true, message: `${label} finished in ${formatDuration(result.durationMs)}: ${formatCounts(result.counts)}.` };
  }
  return { ok: false, message: clip(`${label} failed: ${result.error ?? 'unknown error'}`) };
}

/**
 * Shared wrapper: admin check, "HCP not configured" short-circuit (no DB access), then the work.
 * Never throws; every failure comes back as `{ ok: false, message }` with the detail logged server-side.
 */
async function runAdminSync(
  label: string,
  work: (admin: { id: string }) => Promise<SyncActionResult>,
): Promise<SyncActionResult> {
  let admin;
  try {
    admin = await requireRole('admin');
  } catch (err) {
    if (err instanceof UnauthenticatedError || err instanceof ForbiddenError) {
      return { ok: false, message: err.message };
    }
    console.error(`[admin-sync] ${label}: auth check failed`, err);
    return { ok: false, message: `${label} could not start: the permission check failed.` };
  }

  if (!hcpConfigured()) return NOT_CONFIGURED;

  try {
    const result = await work(admin);
    revalidatePath('/admin/sync');
    return result;
  } catch (err) {
    console.error(`[admin-sync] ${label} threw`, err);
    revalidatePath('/admin/sync');
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : 'unexpected error';
    return { ok: false, message: clip(`${label} failed: ${detail}`) };
  }
}

/** Re-sync the recent window (today-2d .. today+7d NJ) plus anything updated since the last run. */
export async function runReconcileNow(): Promise<SyncActionResult> {
  return runAdminSync('Reconcile', async (admin) => {
    const result = await runReconcile(getSyncDeps(), { trigger: 'admin', startedBy: admin.id });
    return summariseRun('Reconcile', result);
  });
}

/** Employees, catalog and jobs in [today-30d, today+30d] NJ. Slow; can take minutes on a big account. */
export async function runBackfillNow(): Promise<SyncActionResult> {
  return runAdminSync('Backfill', async () => {
    const result = await runBackfill(getSyncDeps(), 'admin');
    return summariseRun('Backfill', result);
  });
}

/** Re-process webhook events that are pending, or failed with attempts left. */
export async function retryWebhooksNow(): Promise<SyncActionResult> {
  return runAdminSync('Webhook retry', async () => {
    const counts: Record<string, number> = {};
    const attempted = await processPendingWebhooks(getSyncDeps(), counts);
    if (attempted === 0) return { ok: true, message: 'No pending or retryable webhook events.' };
    const failed = counts.webhook_failed ?? 0;
    const summary = formatCounts(counts);
    return failed > 0
      ? { ok: false, message: clip(`Retried ${attempted} webhook event(s); ${failed} still failing (${summary}).`) }
      : { ok: true, message: `Retried ${attempted} webhook event(s): ${summary}.` };
  });
}
