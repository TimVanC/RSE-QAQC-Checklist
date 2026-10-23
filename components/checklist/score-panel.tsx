import { CheckIcon, MinusIcon, TriangleAlertIcon } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import type { WorkspaceScore } from './types';

const FAILURES: Array<{ key: keyof WorkspaceScore; label: string; rule: string }> = [
  { key: 'failOpsCheck', label: 'Ops check', rule: 'Step 22 = Y' },
  { key: 'failQaqc', label: 'QA/QC', rule: 'Step 23 = N' },
  { key: 'failToolControl', label: 'Tools', rule: 'Step 26 = N' },
  { key: 'failCallback', label: 'Call back', rule: 'Step 31 = Y' },
];

const STAGES: Array<{ key: keyof WorkspaceScore; label: string; rule: string }> = [
  { key: 'serviceQuote', label: 'Service quote', rule: 'Step 2 = Y' },
  { key: 'inProgress', label: 'In progress', rule: 'Step 17 = Y' },
  { key: 'completed', label: 'Completed', rule: 'Step 34 = Y' },
];

function ResultBadge({ score }: { score: WorkspaceScore }) {
  const result = score.perfectTask ? 'black' : score.failuresValue ? 'red' : null;
  if (result === 'black') {
    return (
      <span className="shrink-0 rounded-md bg-neutral-900 px-2 py-1 text-xs font-semibold whitespace-nowrap text-white dark:bg-neutral-100 dark:text-neutral-900">
        Black · perfect
      </span>
    );
  }
  if (result === 'red') {
    return (
      <span className="shrink-0 rounded-md bg-red-600 px-2 py-1 text-xs font-semibold whitespace-nowrap text-white">
        Red · {score.totalFailures} failure{score.totalFailures === 1 ? '' : 's'}
      </span>
    );
  }
  return (
    <span className="shrink-0 rounded-md border px-2 py-1 text-xs whitespace-nowrap text-muted-foreground">
      Not complete
    </span>
  );
}

/**
 * Compact one-to-two line score for phones and tablets (below lg), shown above the steps:
 * bottom line, result and the four failure flags; stages are added from sm up.
 */
export function ScoreStrip({ score, className }: { score: WorkspaceScore; className?: string }) {
  return (
    <section
      aria-label="Score summary"
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl bg-card px-3 py-2 text-sm text-card-foreground shadow-sm ring-1 ring-foreground/10',
        className,
      )}
    >
      <div className="flex items-baseline gap-1.5">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Bottom line
        </span>
        <span className="text-xl font-semibold tabular-nums" aria-live="polite">
          {score.bottomLine}
          <span className="text-sm font-normal text-muted-foreground">/5</span>
        </span>
      </div>
      <ResultBadge score={score} />
      <ul
        className="flex basis-full flex-wrap items-center gap-1 sm:basis-auto"
        aria-label="Failures"
      >
        {FAILURES.map((f) => {
          const set = score[f.key] === 1;
          return (
            <li
              key={f.key}
              title={f.rule}
              className={cn(
                'flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[0.7rem]',
                set
                  ? 'border-red-300 bg-red-50 font-medium text-red-800 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200'
                  : 'text-muted-foreground',
              )}
            >
              {set ? (
                <TriangleAlertIcon className="size-3" aria-hidden />
              ) : (
                <CheckIcon className="size-3" aria-hidden />
              )}
              <span>{f.label}</span>
              <span className="sr-only">{set ? 'failed' : 'clear'}</span>
            </li>
          );
        })}
      </ul>
      <ul className="hidden items-center gap-2 text-xs sm:flex" aria-label="Stages">
        {STAGES.map((s) => {
          const set = score[s.key] === 1;
          return (
            <li key={s.key} className="flex items-center gap-1" title={s.rule}>
              {set ? (
                <CheckIcon className="size-3 text-emerald-600 dark:text-emerald-400" aria-hidden />
              ) : (
                <MinusIcon className="size-3 text-muted-foreground" aria-hidden />
              )}
              <span className={cn(!set && 'text-muted-foreground')}>{s.label}</span>
              <span className="sr-only">{set ? 'yes' : 'no'}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function ScorePanel({ score, className }: { score: WorkspaceScore; className?: string }) {
  return (
    <section
      aria-label="Score"
      className={cn(
        'rounded-xl bg-card p-4 text-sm text-card-foreground ring-1 ring-foreground/10',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Bottom line
          </div>
          <div className="text-3xl font-semibold tabular-nums" aria-live="polite">
            {score.bottomLine}
            <span className="text-lg font-normal text-muted-foreground">/5</span>
          </div>
        </div>
        <ResultBadge score={score} />
      </div>

      <div className="mt-4">
        <div className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Failures
        </div>
        <ul className="grid grid-cols-2 gap-1.5">
          {FAILURES.map((f) => {
            const set = score[f.key] === 1;
            return (
              <li
                key={f.key}
                title={f.rule}
                className={cn(
                  'flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs',
                  set
                    ? 'border-red-300 bg-red-50 font-medium text-red-800 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200'
                    : 'text-muted-foreground',
                )}
              >
                {set ? (
                  <TriangleAlertIcon className="size-3.5" aria-hidden />
                ) : (
                  <CheckIcon className="size-3.5" aria-hidden />
                )}
                <span>{f.label}</span>
                <span className="sr-only">{set ? 'failed' : 'clear'}</span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="mt-4">
        <div className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Stages
        </div>
        <ul className="space-y-1">
          {STAGES.map((s) => {
            const set = score[s.key] === 1;
            return (
              <li key={s.key} className="flex items-center gap-2 text-xs" title={s.rule}>
                <span
                  className={cn(
                    'flex size-4 items-center justify-center rounded-sm border',
                    set &&
                      'border-emerald-500 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-100',
                  )}
                  aria-hidden
                >
                  {set ? (
                    <CheckIcon className="size-3" />
                  ) : (
                    <MinusIcon className="size-3 text-muted-foreground" />
                  )}
                </span>
                <span className={cn(!set && 'text-muted-foreground')}>{s.label}</span>
                <span className="sr-only">{set ? 'yes' : 'no'}</span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="mt-4 flex items-center justify-between border-t pt-3 text-xs">
        <span className="text-muted-foreground">Completed marks</span>
        <span className="font-medium tabular-nums">{score.completedMarks}</span>
      </div>
    </section>
  );
}
