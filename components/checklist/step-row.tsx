'use client';

import { Loader2Icon } from 'lucide-react';
import type { KeyboardEvent, ReactNode } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ANSWER_VALUES, type AnswerValue, type StepDef } from '@/src/config/checklist-steps';
import { cn } from '@/src/lib/utils';
import { toggleAnswer } from './keyboard';
import { readEvidence, rowTone, suggestionOutcome } from './step-state';

const ANSWER_LABELS: Record<AnswerValue, string> = { Y: 'Yes', N: 'No', B: 'B' };

const SELECTED_CLASS: Record<AnswerValue, string> = {
  Y: 'border-emerald-500 bg-emerald-100 text-emerald-900 dark:border-emerald-500 dark:bg-emerald-900/60 dark:text-emerald-50',
  N: 'border-neutral-500 bg-neutral-200 text-neutral-900 dark:border-neutral-400 dark:bg-neutral-700 dark:text-neutral-50',
  B: 'border-amber-500 bg-amber-100 text-amber-900 dark:border-amber-500 dark:bg-amber-900/60 dark:text-amber-50',
};

const TONE_CLASS = {
  failure: 'border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40',
  warning: 'border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40',
  success: 'border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40',
} as const;

export interface StepRowProps {
  step: StepDef;
  index: number;
  text: string;
  value: AnswerValue | null;
  suggested: AnswerValue | null;
  evidence: Record<string, unknown> | null;
  isActive: boolean;
  readOnly: boolean;
  saving: boolean;
  rowRef: (el: HTMLDivElement | null) => void;
  onAnswer: (stepKey: string, value: AnswerValue | null) => void;
  onFocusRow: (index: number) => void;
  onRowKeyDown: (e: KeyboardEvent<HTMLDivElement>, index: number) => void;
  /** Step fields (dates, order no.) rendered inline. */
  fields?: ReactNode;
  /** Extra content under the step (call back prompt, links). */
  children?: ReactNode;
  /** Extra muted note line (e.g. "Set by Submit"). */
  hint?: string;
}

export function StepRow({
  step,
  index,
  text,
  value,
  suggested,
  evidence,
  isActive,
  readOnly,
  saving,
  rowRef,
  onAnswer,
  onFocusRow,
  onRowKeyDown,
  fields,
  children,
  hint,
}: StepRowProps) {
  const isSub = step.kind === 'sub';
  const tone = rowTone(step, value);
  const ev = suggested ? readEvidence(evidence) : null;
  const outcome = suggestionOutcome(suggested, value);
  const showDashed = suggested !== null && value === null && ev?.confidence === 'high' && !readOnly;
  const textId = `step-${step.key}-text`;

  return (
    <div
      ref={rowRef}
      role="listitem"
      tabIndex={isActive ? 0 : -1}
      data-step={step.key}
      aria-labelledby={textId}
      aria-describedby={`step-${step.key}-answer`}
      onFocus={() => onFocusRow(index)}
      onKeyDown={(e) => onRowKeyDown(e, index)}
      className={cn(
        'grid scroll-mt-20 scroll-mb-28 grid-cols-[2.75rem_minmax(0,1fr)] items-start gap-x-3 gap-y-2 rounded-lg border border-transparent px-3 py-2 transition-colors outline-none sm:grid-cols-[2.75rem_minmax(0,1fr)_auto]',
        'focus-visible:ring-2 focus-visible:ring-ring/60',
        isSub && 'py-1.5 pl-9',
        tone ? TONE_CLASS[tone] : 'hover:bg-muted/40',
      )}
    >
      <div
        className={cn(
          'pt-0.5 font-semibold tabular-nums',
          isSub ? 'text-xs text-muted-foreground' : 'text-sm',
        )}
        aria-hidden
      >
        {step.label}
      </div>

      <div className="min-w-0 space-y-1.5">
        <p id={textId} className={cn('leading-snug', isSub ? 'text-[0.8rem]' : 'text-sm')}>
          <span className="sr-only">Step {step.label}: </span>
          {text}
        </p>
        {step.note && <p className="text-xs leading-snug text-muted-foreground">{step.note}</p>}
        {hint && <p className="text-xs text-muted-foreground italic">{hint}</p>}
        {fields}
        {ev && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <Tooltip>
              <TooltipTrigger
                delay={250}
                render={
                  <span
                    tabIndex={0}
                    className="inline-flex h-5 cursor-help items-center gap-1 rounded-full border border-sky-300 bg-sky-50 px-2 font-medium text-sky-800 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-200"
                  />
                }
              >
                From Housecall Pro · suggests {suggested}
                {ev.confidence === 'low' && (
                  <span className="font-normal opacity-80">(low confidence)</span>
                )}
              </TooltipTrigger>
              <TooltipContent side="bottom" className="block max-w-sm text-left">
                {ev.details.length === 0 ? (
                  <span>No further evidence recorded.</span>
                ) : (
                  <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5">
                    {ev.details.map((d) => (
                      <div key={d.label} className="contents">
                        <dt className="opacity-70">{d.label}</dt>
                        <dd className="break-words">{d.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </TooltipContent>
            </Tooltip>
            {ev.summary && <span className="text-muted-foreground">{ev.summary}</span>}
            {outcome && !saving && (
              <span
                className={cn(
                  'text-[0.7rem] font-medium',
                  outcome === 'confirmed'
                    ? 'text-emerald-700 dark:text-emerald-300'
                    : 'text-amber-700 dark:text-amber-300',
                )}
              >
                {outcome}
              </span>
            )}
          </div>
        )}
        {children}
      </div>

      <div
        className="col-start-2 flex items-center gap-1.5 sm:col-start-3 sm:row-start-1"
        role="group"
        aria-label={`Answer for step ${step.label}`}
      >
        <span id={`step-${step.key}-answer`} className="sr-only">
          {value ? `Answered ${ANSWER_LABELS[value]}` : 'Not answered'}
        </span>
        {ANSWER_VALUES.map((v) => {
          const selected = value === v;
          const dashed = showDashed && suggested === v;
          return (
            <button
              key={v}
              type="button"
              tabIndex={-1}
              data-answer-button=""
              aria-pressed={selected}
              aria-label={`${v === 'B' ? 'B' : ANSWER_LABELS[v]} for step ${step.label}`}
              title={dashed ? `Suggested by Housecall Pro: ${v}` : undefined}
              disabled={readOnly}
              onClick={() => onAnswer(step.key, toggleAnswer(value, v))}
              className={cn(
                'flex items-center justify-center rounded-md border text-sm font-semibold transition-colors outline-none select-none disabled:cursor-not-allowed disabled:opacity-60',
                isSub ? 'size-8' : 'size-9',
                selected
                  ? SELECTED_CLASS[v]
                  : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
                dashed && 'border-2 border-dashed border-sky-500 text-sky-700 dark:text-sky-300',
              )}
            >
              {v}
            </button>
          );
        })}
        <span className="flex w-4 justify-center" aria-hidden>
          {saving && <Loader2Icon className="size-3.5 animate-spin text-muted-foreground" />}
        </span>
      </div>
    </div>
  );
}
