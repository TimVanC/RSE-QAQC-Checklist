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

export function ScorePanel({ score, className }: { score: WorkspaceScore; className?: string }) {
  const result = score.perfectTask ? 'black' : score.failuresValue ? 'red' : null;
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
        {result === 'black' ? (
          <span className="rounded-md bg-neutral-900 px-2 py-1 text-xs font-semibold text-white dark:bg-neutral-100 dark:text-neutral-900">
            Black · perfect
          </span>
        ) : result === 'red' ? (
          <span className="rounded-md bg-red-600 px-2 py-1 text-xs font-semibold text-white">
            Red · {score.totalFailures} failure{score.totalFailures === 1 ? '' : 's'}
          </span>
        ) : (
          <span className="rounded-md border px-2 py-1 text-xs text-muted-foreground">
            Not complete
          </span>
        )}
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
