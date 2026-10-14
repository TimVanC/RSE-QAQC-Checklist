'use client';

import { RefreshCwIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/src/lib/utils';

interface RefreshResponse {
  status?: 'ok' | 'error';
  counts?: Record<string, number>;
  error?: string;
  retryAfterSeconds?: number;
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function report(httpStatus: number, body: RefreshResponse) {
  if (httpStatus === 200) {
    const checked = body.counts?.window_jobs ?? 0;
    const changed = Math.max(0, checked - (body.counts?.unchanged ?? 0));
    toast.success('Queue refreshed from Housecall Pro', {
      description: `${plural(checked, 'job')} checked, ${changed} new or changed.`,
    });
  } else if (httpStatus === 429) {
    const wait = body.retryAfterSeconds ?? 60;
    toast.info(`Already refreshed, try again in ${wait} s.`);
  } else if (httpStatus === 503) {
    toast.error(body.error ?? 'Housecall Pro is not connected yet.');
  } else if (httpStatus === 401) {
    toast.error('Your session has expired. Sign in again.');
  } else if (httpStatus === 403) {
    toast.error('You do not have permission to refresh.');
  } else {
    toast.error('Refresh failed', {
      description: body.error ?? `The server returned ${httpStatus}.`,
    });
  }
}

/** Re-sync the selected day from Housecall Pro (POST /api/sync/refresh), then re-render the queue. */
export function RefreshButton({ date }: { date: string }) {
  const router = useRouter();
  const [fetching, setFetching] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const busy = fetching || refreshing;

  async function onClick() {
    setFetching(true);
    try {
      const res = await fetch('/api/sync/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date }),
      });
      const body = (await res.json().catch(() => ({}))) as RefreshResponse;
      report(res.status, body);
      startTransition(() => router.refresh());
    } catch {
      toast.error('Could not reach the server. Check your connection and try again.');
    } finally {
      setFetching(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={busy}>
      <RefreshCwIcon data-icon="inline-start" className={cn(busy && 'animate-spin')} />
      {busy ? 'Refreshing…' : 'Refresh'}
    </Button>
  );
}
