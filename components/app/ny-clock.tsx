'use client';

import { useSyncExternalStore } from 'react';

const TZ = 'America/New_York';

function formatNow() {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date());
}

function subscribe(onChange: () => void) {
  const id = setInterval(onChange, 30_000);
  return () => clearInterval(id);
}

/** Current New Jersey time, so the call team always sees the date the jobs are keyed to. */
export function NyClock() {
  // Server snapshot is empty so the markup matches on hydration; the client fills it in.
  const text = useSyncExternalStore(subscribe, formatNow, () => '');
  return (
    <span className="text-muted-foreground tabular-nums" title="New Jersey time (America/New_York)">
      {text ? `${text} NJ` : ''}
    </span>
  );
}
