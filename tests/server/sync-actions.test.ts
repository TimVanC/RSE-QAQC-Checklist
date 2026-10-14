import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  hcpConfigured: vi.fn(),
  getSyncDeps: vi.fn(),
  runReconcile: vi.fn(),
  runBackfill: vi.fn(),
  processPendingWebhooks: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('@/src/lib/auth/session', () => {
  class ForbiddenError extends Error {
    constructor(message = 'You do not have permission to do that.') {
      super(message);
    }
  }
  class UnauthenticatedError extends Error {
    constructor() {
      super('Not signed in.');
    }
  }
  return { ForbiddenError, UnauthenticatedError, requireRole: mocks.requireRole };
});
vi.mock('@/src/lib/hcp/deps', () => ({ getSyncDeps: mocks.getSyncDeps, hcpConfigured: mocks.hcpConfigured }));
vi.mock('@/src/lib/hcp/sync', () => ({ runReconcile: mocks.runReconcile, runBackfill: mocks.runBackfill }));
vi.mock('@/src/lib/hcp/webhook-processor', () => ({ processPendingWebhooks: mocks.processPendingWebhooks }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));

import { ForbiddenError } from '@/src/lib/auth/session';
import { retryWebhooksNow, runBackfillNow, runReconcileNow } from '@/src/server/actions/sync';

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.requireRole.mockResolvedValue({ id: 'admin-1' });
  mocks.hcpConfigured.mockReturnValue(true);
  mocks.getSyncDeps.mockReturnValue({ deps: true });
});

describe('admin sync actions', () => {
  it('refuses without touching sync code when HCP_API_KEY is not set', async () => {
    mocks.hcpConfigured.mockReturnValue(false);
    for (const action of [runReconcileNow, runBackfillNow, retryWebhooksNow]) {
      await expect(action()).resolves.toEqual({
        ok: false,
        message: 'HCP_API_KEY is not set; connect Housecall Pro first.',
      });
    }
    expect(mocks.getSyncDeps).not.toHaveBeenCalled();
    expect(mocks.runReconcile).not.toHaveBeenCalled();
    expect(mocks.runBackfill).not.toHaveBeenCalled();
    expect(mocks.processPendingWebhooks).not.toHaveBeenCalled();
  });

  it('returns a friendly result instead of throwing for non-admins', async () => {
    mocks.requireRole.mockRejectedValue(new ForbiddenError());
    const result = await runReconcileNow();
    expect(result.ok).toBe(false);
    expect(result.message).toBe('You do not have permission to do that.');
    expect(mocks.getSyncDeps).not.toHaveBeenCalled();
  });

  it('runs reconcile as the admin with trigger "admin" and summarises counts', async () => {
    mocks.runReconcile.mockResolvedValue({
      runId: 'r1',
      status: 'ok',
      counts: { jobs: 12, customers: 0, invoices: 3 },
      durationMs: 4200,
    });
    const result = await runReconcileNow();
    expect(mocks.runReconcile).toHaveBeenCalledWith({ deps: true }, { trigger: 'admin', startedBy: 'admin-1' });
    expect(result).toEqual({ ok: true, message: 'Reconcile finished in 4.2s: jobs=12, invoices=3.' });
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/sync');
  });

  it('reports a failed run as ok=false with the recorded error', async () => {
    mocks.runBackfill.mockResolvedValue({
      runId: 'r2',
      status: 'error',
      counts: {},
      error: 'HcpApiError: 401 unauthorized',
      durationMs: 800,
    });
    const result = await runBackfillNow();
    expect(mocks.runBackfill).toHaveBeenCalledWith({ deps: true }, 'admin');
    expect(result).toEqual({ ok: false, message: 'Backfill failed: HcpApiError: 401 unauthorized' });
  });

  it('catches unexpected exceptions and never throws to the client', async () => {
    mocks.getSyncDeps.mockImplementation(() => {
      throw new Error('DATABASE_URL is not set');
    });
    const result = await runReconcileNow();
    expect(result.ok).toBe(false);
    expect(result.message).toContain('DATABASE_URL is not set');
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/sync');
  });

  it('summarises webhook retries, including events that still fail', async () => {
    mocks.processPendingWebhooks.mockImplementationOnce(async (_deps: unknown, counts: Record<string, number>) => {
      counts.webhook_processed = 2;
      return 2;
    });
    await expect(retryWebhooksNow()).resolves.toEqual({
      ok: true,
      message: 'Retried 2 webhook event(s): webhook_processed=2.',
    });

    mocks.processPendingWebhooks.mockImplementationOnce(async (_deps: unknown, counts: Record<string, number>) => {
      counts.webhook_processed = 1;
      counts.webhook_failed = 1;
      return 2;
    });
    const partial = await retryWebhooksNow();
    expect(partial.ok).toBe(false);
    expect(partial.message).toContain('1 still failing');

    mocks.processPendingWebhooks.mockResolvedValueOnce(0);
    await expect(retryWebhooksNow()).resolves.toEqual({ ok: true, message: 'No pending or retryable webhook events.' });
  });
});
