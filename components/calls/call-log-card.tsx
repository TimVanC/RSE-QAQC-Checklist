'use client';

import { PhoneCallIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CALL_OUTCOME_LABELS, type CallOutcome } from '@/src/lib/calls';
import { formatApp } from '@/src/lib/time';
import { cn } from '@/src/lib/utils';
import { LogCallDialog } from './log-call-dialog';

export interface CallLogItem {
  id: string;
  callDate: string;
  outcome: CallOutcome;
  note: string | null;
  calledAt: string;
  calledByName: string | null;
}

export const OUTCOME_BADGE: Record<CallOutcome, string> = {
  reached:
    'border-transparent bg-emerald-100 text-emerald-900 dark:bg-emerald-400/15 dark:text-emerald-300',
  no_answer: 'border-transparent bg-rose-100 text-rose-900 dark:bg-rose-400/15 dark:text-rose-300',
  callback_later:
    'border-transparent bg-amber-100 text-amber-900 dark:bg-amber-400/15 dark:text-amber-300',
};

export interface CallLogCardProps {
  hcpJobId: string;
  callDate: string;
  customerName: string;
  entries: CallLogItem[];
  /** Hide the Log call button (submitted checklist). */
  readOnly?: boolean;
}

/**
 * The job's call log on the checklist page: every attempt newest first, plus a button to add one.
 * On multi-day jobs this is the nightly check-in: log "Reached" with a note of what was done.
 */
export function CallLogCard({
  hcpJobId,
  callDate,
  customerName,
  entries,
  readOnly,
}: CallLogCardProps) {
  return (
    <section
      aria-label="Call log"
      className="rounded-xl bg-card p-4 text-card-foreground ring-1 ring-foreground/10"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <PhoneCallIcon className="size-4" aria-hidden />
          Call log
          <span className="font-normal text-muted-foreground">
            {entries.length === 0
              ? 'No calls logged yet'
              : `${entries.length} attempt${entries.length === 1 ? '' : 's'}`}
          </span>
        </h2>
        {!readOnly && (
          <LogCallDialog
            hcpJobId={hcpJobId}
            callDate={callDate}
            customerName={customerName}
            defaultOutcome="reached"
            trigger={
              <Button variant="outline" size="sm" className="h-10 sm:h-7">
                <PhoneCallIcon data-icon="inline-start" />
                Log call
              </Button>
            }
          />
        )}
      </div>
      {entries.length > 0 && (
        <ul className="mt-3 divide-y">
          {entries.map((e) => (
            <li key={e.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2 text-sm">
              <Badge variant="outline" className={cn('shrink-0', OUTCOME_BADGE[e.outcome])}>
                {CALL_OUTCOME_LABELS[e.outcome]}
              </Badge>
              <span className="text-muted-foreground tabular-nums">
                {formatApp(e.calledAt, 'MMM d, h:mm a')}
              </span>
              <span className="text-muted-foreground">by {e.calledByName ?? 'unknown'}</span>
              {e.note && (
                <span className="basis-full break-words sm:flex-1 sm:basis-auto">{e.note}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
