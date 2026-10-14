'use client';

import { useState, useTransition } from 'react';
import { Loader2Icon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  retryWebhooksNow,
  runBackfillNow,
  runReconcileNow,
  type SyncActionResult,
} from '@/src/server/actions/sync';

type ActionKey = 'reconcile' | 'backfill' | 'webhooks';

export function SyncActions({ pendingWebhooks }: { pendingWebhooks: number }) {
  const [isPending, startTransition] = useTransition();
  const [active, setActive] = useState<ActionKey | null>(null);

  function run(key: ActionKey, action: () => Promise<SyncActionResult>) {
    setActive(key);
    startTransition(async () => {
      try {
        const result = await action();
        if (result.ok) toast.success(result.message);
        else toast.error(result.message);
      } catch {
        toast.error('The request failed before the server answered. Check the connection and try again.');
      } finally {
        setActive(null);
      }
    });
  }

  function label(key: ActionKey, idle: string, busy: string) {
    return isPending && active === key ? (
      <>
        <Loader2Icon className="animate-spin" data-icon="inline-start" />
        {busy}
      </>
    ) : (
      idle
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={isPending} onClick={() => run('reconcile', runReconcileNow)}>
          {label('reconcile', 'Run reconcile now', 'Reconciling…')}
        </Button>
        <Button size="sm" variant="outline" disabled={isPending} onClick={() => run('backfill', runBackfillNow)}>
          {label('backfill', 'Run backfill now', 'Backfilling…')}
        </Button>
        <Button size="sm" variant="outline" disabled={isPending} onClick={() => run('webhooks', retryWebhooksNow)}>
          {label('webhooks', `Retry webhooks (${pendingWebhooks})`, 'Retrying…')}
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        Reconcile: jobs from 2 days back to 7 days ahead, plus anything changed since the last run. Backfill: employees,
        catalog and 30 days either side (slow). Retry: webhook events that are pending or failed with attempts left.
      </p>
    </div>
  );
}
