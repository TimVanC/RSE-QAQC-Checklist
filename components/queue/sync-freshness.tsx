'use client';

import { useCallback, useSyncExternalStore } from 'react';

function relative(fromMs: number, nowMs: number): string {
  const minutes = Math.floor(Math.max(0, nowMs - fromMs) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function subscribe(onChange: () => void) {
  const id = setInterval(onChange, 30_000);
  return () => clearInterval(id);
}

/**
 * "Updated X min ago" for the most recent successful sync. Ticks every 30 s on the client;
 * the server render uses the request time so hydration matches.
 */
export function SyncFreshness({
  finishedAt,
  serverNow,
  title,
}: {
  finishedAt: string | null;
  serverNow: number;
  title?: string;
}) {
  const from = finishedAt ? new Date(finishedAt).getTime() : null;
  const getSnapshot = useCallback(() => (from === null ? '' : relative(from, Date.now())), [from]);
  const getServerSnapshot = useCallback(
    () => (from === null ? '' : relative(from, serverNow)),
    [from, serverNow],
  );
  const text = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <span className="text-sm text-muted-foreground tabular-nums" title={title}>
      {from === null ? 'No sync yet' : `Updated ${text}`}
    </span>
  );
}
