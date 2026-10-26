'use client';

import { CheckIcon, Loader2Icon, LockIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  CHECKLIST_STEPS,
  stepText,
  type AnswerValue,
  type FieldKey,
  type StepDef,
} from '@/src/config/checklist-steps';
import { hasRole } from '@/src/lib/auth/roles';
import { formatApp } from '@/src/lib/time';
import {
  createCallbackChecklist,
  reopenChecklist,
  resetChecklist,
  saveAnswer,
  submitChecklist,
  type ActionResult,
} from '@/src/server/actions/checklists';
import { AutosaveInput, AutosaveTextarea } from './autosave-input';
import { callSaveField, type FieldName } from './fields';
import { HeaderCard } from './header-card';
import {
  clampIndex,
  exitsField,
  firstUnansweredIndex,
  isTypingTarget,
  keyAction,
} from './keyboard';
import { ScorePanel, ScoreStrip } from './score-panel';
import { ShortcutsPopover } from './shortcuts-popover';
import { blankScoringSteps, localScore, normalizeScore } from './step-state';
import { StepRow } from './step-row';
import { SubmitBar } from './submit-bar';
import type {
  WorkspaceAnswer,
  WorkspaceChecklist,
  WorkspaceData,
  WorkspaceLinkedChecklist,
  WorkspaceScore,
  WorkspaceUser,
} from './types';

const STEPS = CHECKLIST_STEPS;
const STEP_KEYS = STEPS.map((s) => s.key);
const SUBMIT_STEP_KEY = STEPS.find((s) => s.autoCheck === 'submitted')?.key ?? 's33';
const NETWORK_ERROR = 'Could not reach the server. Check your connection and try again.';

type Values = Record<string, AnswerValue | null>;
type SaveState = 'idle' | 'saved' | 'error';

function toValues(answers: Record<string, WorkspaceAnswer>): Values {
  const out: Values = {};
  for (const s of STEPS) out[s.key] = answers[s.key]?.value ?? null;
  return out;
}

function stepFieldInitial(c: WorkspaceChecklist): Record<FieldKey, string> {
  return {
    permit_submitted_on: c.permitSubmittedOn ?? '',
    permit_followup_on: c.permitFollowupOn ?? '',
    permit_approved_on: c.permitApprovedOn ?? '',
    parts_received_on: c.partsReceivedOn ?? '',
    parts_order_no: c.partsOrderNo ?? '',
  };
}

function SaveStatus({ pending, state }: { pending: number; state: SaveState }) {
  let content: ReactNode;
  if (pending > 0) {
    content = (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <Loader2Icon className="size-3 animate-spin" aria-hidden />
        Saving…
      </span>
    );
  } else if (state === 'error') {
    content = <span className="font-medium text-destructive">Last change not saved</span>;
  } else if (state === 'saved') {
    content = (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <CheckIcon className="size-3" aria-hidden />
        Saved
      </span>
    );
  } else {
    content = <span className="text-muted-foreground">Changes save automatically</span>;
  }
  return <span aria-live="polite">{content}</span>;
}

function statusLabel(status: WorkspaceLinkedChecklist['status']): string {
  return status === 'submitted'
    ? 'Submitted'
    : status === 'in_progress'
      ? 'In progress'
      : 'Not started';
}

function CallbackSection({
  answeredYes,
  callbacks,
  creating,
  onCreate,
}: {
  answeredYes: boolean;
  callbacks: WorkspaceLinkedChecklist[];
  creating: boolean;
  onCreate: () => void;
}) {
  if (!answeredYes && callbacks.length === 0) return null;
  return (
    <div className="space-y-2 pt-1">
      {answeredYes && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-red-300 bg-background/80 p-2 text-xs dark:border-red-900">
          <span className="min-w-40 flex-1">
            A call back was incurred. Start a Call Back Checklist for the return visit.
          </span>
          <Button
            size="sm"
            variant={callbacks.length ? 'outline' : 'default'}
            className="h-auto min-h-10 w-full py-1.5 whitespace-normal sm:h-7 sm:min-h-0 sm:w-auto sm:py-0 sm:whitespace-nowrap"
            onClick={onCreate}
            disabled={creating}
          >
            {creating
              ? 'Creating…'
              : callbacks.length
                ? 'Create another Call Back Checklist'
                : 'Create Call Back Checklist'}
          </Button>
        </div>
      )}
      {callbacks.length > 0 && (
        <ul className="space-y-0.5 text-xs" aria-label="Call back checklists">
          {callbacks.map((cb, i) => (
            <li key={cb.id} className="flex flex-wrap items-center gap-x-1.5">
              <Link
                href={`/checklists/${cb.id}`}
                className="font-medium underline underline-offset-2"
              >
                Call Back Checklist {i + 1}
              </Link>
              <span className="text-muted-foreground">
                · created {formatApp(cb.createdAt, 'MMM d, yyyy')} · {statusLabel(cb.status)}
                {cb.submittedAt ? ` ${formatApp(cb.submittedAt, 'MMM d, h:mm a')}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export interface ChecklistWorkspaceProps {
  data: WorkspaceData;
  currentUser: WorkspaceUser;
}

export function ChecklistWorkspace({ data, currentUser }: ChecklistWorkspaceProps) {
  const router = useRouter();
  const { checklist } = data;
  const checklistId = checklist.id;
  const isCallback = checklist.type === 'callback';

  // ---- checklist status -------------------------------------------------------------------
  const [status, setStatus] = useState(checklist.status);
  const [submittedAt, setSubmittedAt] = useState(checklist.submittedAt);
  const [submittedByName, setSubmittedByName] = useState(data.submittedByName);
  const [reopenedAt, setReopenedAt] = useState(checklist.reopenedAt);
  const [reopenedByName, setReopenedByName] = useState(data.reopenedByName);
  const [callDate, setCallDate] = useState(checklist.callDate);
  const readOnly = status === 'submitted';
  const canReopen = readOnly && hasRole(currentUser.role, 'manager');
  const readOnlyRef = useRef(readOnly);
  useEffect(() => {
    readOnlyRef.current = readOnly;
  }, [readOnly]);

  // ---- answers + score ----------------------------------------------------------------------
  const [values, setValues] = useState<Values>(() => toValues(data.answers));
  const valuesRef = useRef<Values>(values);
  const confirmedRef = useRef<Values>(values);
  const versionRef = useRef<Record<string, number>>({});
  const lastAnswerOpRef = useRef(0);
  const [score, setScore] = useState<WorkspaceScore>(
    () => data.score ?? localScore(toValues(data.answers)),
  );
  const [pendingSteps, setPendingSteps] = useState<Record<string, number>>({});

  // ---- save queue: every mutation runs in order, one at a time -----------------------------
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const [pending, setPending] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>('idle');

  const enqueue = useCallback(
    <T,>(task: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> => {
      setPending((n) => n + 1);
      const run: Promise<ActionResult<T>> = queueRef.current.then(async () => {
        try {
          return await task();
        } catch (err) {
          console.error('[checklist] save failed', err);
          return { ok: false, error: NETWORK_ERROR } as ActionResult<T>;
        }
      });
      queueRef.current = run;
      void run.then((res) => {
        setPending((n) => n - 1);
        setSaveState(res.ok ? 'saved' : 'error');
      });
      return run;
    },
    [],
  );

  useEffect(() => {
    if (pending === 0) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [pending]);

  const saveFieldValue = useCallback(
    async (field: FieldName, value: string | null): Promise<boolean> => {
      const res = await enqueue(() => callSaveField(checklistId, field, value));
      if (!res.ok) toast.error(res.error);
      return res.ok;
    },
    [checklistId, enqueue],
  );

  const applyValues = useCallback((next: Values) => {
    valuesRef.current = next;
    setValues(next);
  }, []);

  const setAnswer = useCallback(
    (stepKey: string, value: AnswerValue | null) => {
      if (readOnlyRef.current) return;
      const before = valuesRef.current[stepKey] ?? null;
      if (before === value) return;
      const next = { ...valuesRef.current, [stepKey]: value };
      applyValues(next);
      setScore(localScore(next));

      const version = (versionRef.current[stepKey] ?? 0) + 1;
      versionRef.current[stepKey] = version;
      const opId = ++lastAnswerOpRef.current;
      setPendingSteps((p) => ({ ...p, [stepKey]: (p[stepKey] ?? 0) + 1 }));

      void enqueue(() => saveAnswer({ checklistId, stepKey, value })).then((res) => {
        setPendingSteps((p) => {
          const copy = { ...p };
          const n = (copy[stepKey] ?? 1) - 1;
          if (n <= 0) delete copy[stepKey];
          else copy[stepKey] = n;
          return copy;
        });
        if (res.ok) {
          confirmedRef.current = { ...confirmedRef.current, [stepKey]: value };
          if (opId === lastAnswerOpRef.current) {
            setScore(normalizeScore(res.data.score) ?? localScore(valuesRef.current));
          }
          return;
        }
        toast.error(res.error);
        if (versionRef.current[stepKey] === version) {
          const reverted = {
            ...valuesRef.current,
            [stepKey]: confirmedRef.current[stepKey] ?? null,
          };
          applyValues(reverted);
          setScore(localScore(reverted));
        }
      });
    },
    [applyValues, checklistId, enqueue],
  );

  // ---- roving focus + keyboard ------------------------------------------------------------
  const rowRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [activeIndex, setActiveIndex] = useState(() =>
    firstUnansweredIndex(STEP_KEYS, toValues(data.answers)),
  );
  const activeIndexRef = useRef(activeIndex);
  const submitButtonRef = useRef<HTMLButtonElement>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  const focusRow = useCallback((index: number) => {
    const i = clampIndex(index, STEPS.length);
    activeIndexRef.current = i;
    setActiveIndex(i);
    const el = rowRefs.current[i];
    if (el) {
      el.focus({ preventScroll: true });
      el.scrollIntoView({ block: 'nearest' });
    }
  }, []);

  const onFocusRow = useCallback((index: number) => {
    activeIndexRef.current = index;
    setActiveIndex(index);
  }, []);

  const handleRowKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>, index: number) => {
      const target = e.target as HTMLElement;
      // Inner controls (date/text fields, links, the call back button) keep their native keys.
      if (target !== e.currentTarget && !target.hasAttribute('data-answer-button')) {
        if (exitsField(e)) {
          e.preventDefault();
          focusRow(index);
        }
        return;
      }
      const action = keyAction(e, index, STEPS.length, readOnlyRef.current);
      if (!action) return;
      e.preventDefault();
      switch (action.kind) {
        case 'focus':
          focusRow(action.index);
          break;
        case 'answer':
          setAnswer(STEPS[index].key, action.value);
          focusRow(action.focus);
          break;
        case 'clear':
          setAnswer(STEPS[index].key, null);
          break;
        case 'submit':
          if (submitButtonRef.current) {
            submitButtonRef.current.focus({ preventScroll: true });
          }
          break;
        case 'help':
          setHelpOpen((o) => !o);
          break;
      }
    },
    [focusRow, setAnswer],
  );

  // With nothing focused, j/k/y/n/b bring focus to the current step; ? toggles the shortcuts.
  useEffect(() => {
    function onKeyDown(e: globalThis.KeyboardEvent) {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (isTypingTarget(t)) return;
      if (t && t !== document.body && t !== document.documentElement) return;
      if (e.key === '?') {
        e.preventDefault();
        setHelpOpen((o) => !o);
        return;
      }
      if (['j', 'k', 'y', 'n', 'b'].includes(e.key.toLowerCase())) {
        e.preventDefault();
        focusRow(activeIndexRef.current);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [focusRow]);

  // A fresh checklist starts with step 1 focused, so the caller can answer straight away.
  useEffect(() => {
    if (readOnlyRef.current) return;
    if (activeIndexRef.current !== 0 || valuesRef.current[STEP_KEYS[0]] != null) return;
    rowRefs.current[0]?.focus({ preventScroll: true });
  }, []);

  // ---- submit / reopen / call back ---------------------------------------------------------
  const handleSubmit = useCallback(async (): Promise<boolean> => {
    const res = await enqueue(() => submitChecklist(checklistId));
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    const next = { ...valuesRef.current, [SUBMIT_STEP_KEY]: 'Y' as const };
    confirmedRef.current = { ...confirmedRef.current, [SUBMIT_STEP_KEY]: 'Y' };
    applyValues(next);
    setScore(normalizeScore(res.data.score) ?? localScore(next));
    setStatus('submitted');
    setSubmittedAt(new Date().toISOString());
    setSubmittedByName(currentUser.name);
    toast.success('Checklist submitted.');
    // Back to the day's call queue so the caller can move to the next job.
    router.push(`/queue?date=${encodeURIComponent(callDate)}`);
    router.refresh();
    return true;
  }, [applyValues, callDate, checklistId, currentUser.name, enqueue, router]);

  const handleReopen = useCallback(async (): Promise<boolean> => {
    const res = await enqueue(() => reopenChecklist(checklistId));
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    setStatus('in_progress');
    setReopenedAt(new Date().toISOString());
    setReopenedByName(currentUser.name);
    toast.success('Checklist reopened.');
    router.refresh();
    return true;
  }, [checklistId, currentUser.name, enqueue, router]);

  // Reset clears everything server-side; the page re-renders with a new key, so local state is rebuilt.
  const handleReset = useCallback(async (): Promise<boolean> => {
    const res = await enqueue(() => resetChecklist(checklistId));
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    toast.success('Checklist reset to Not started.');
    router.refresh();
    return true;
  }, [checklistId, enqueue, router]);
  const canReset = !readOnly || hasRole(currentUser.role, 'manager');

  const [creatingCallback, startCreateCallback] = useTransition();
  const createCallback = useCallback(() => {
    startCreateCallback(async () => {
      const res = await enqueue(() => createCallbackChecklist(checklistId));
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success('Call Back Checklist created.');
      router.push(`/checklists/${res.data.id}`);
    });
  }, [checklistId, enqueue, router]);

  // ---- render -------------------------------------------------------------------------------
  const fieldInitial = stepFieldInitial(checklist);
  const answeredCount = STEPS.filter((s) => values[s.key] != null).length;
  const blanks = blankScoringSteps(STEPS, values).map((s) => ({
    key: s.key,
    label: s.label,
    text: stepText(s, checklist.type),
  }));
  const saveStatus = <SaveStatus pending={pending} state={saveState} />;

  function renderFields(step: StepDef): ReactNode {
    if (!step.fields?.length) return undefined;
    return (
      <div className="flex flex-col gap-2 pt-0.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4">
        {step.fields.map((f) => (
          <div key={f.key} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
            <Label htmlFor={`field-${f.key}`} className="text-xs font-normal text-muted-foreground">
              {f.label}
            </Label>
            <AutosaveInput
              id={`field-${f.key}`}
              type={f.type}
              className="h-10 w-full text-base sm:h-7 sm:w-40 sm:text-xs md:text-xs"
              initialValue={fieldInitial[f.key]}
              onSave={(v) => saveFieldValue(f.key, f.type === 'date' ? v || null : v)}
              debounceMs={f.type === 'date' ? 400 : 500}
              disabled={readOnly}
              autoComplete="off"
            />
          </div>
        ))}
      </div>
    );
  }

  function renderExtra(step: StepDef): ReactNode {
    if (step.triggersCallback && !isCallback) {
      return (
        <CallbackSection
          answeredYes={values[step.key] === 'Y'}
          callbacks={data.callbacks}
          creating={creatingCallback}
          onCreate={createCallback}
        />
      );
    }
    if (step.scoringRole === 'completed' && isCallback && data.parent) {
      return (
        <Link
          href={`/checklists/${data.parent.id}`}
          className="text-xs font-medium underline underline-offset-2"
        >
          Open the original appointment checklist
        </Link>
      );
    }
    return null;
  }

  return (
    <div className="space-y-4">
      {isCallback && data.parent && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          <span>Call Back Checklist for this job.</span>
          <Link
            href={`/checklists/${data.parent.id}`}
            className="font-medium underline underline-offset-2"
          >
            Return to original appointment checklist
          </Link>
        </div>
      )}

      <HeaderCard
        checklist={checklist}
        job={data.job}
        technicianName={data.technicianName}
        assignedTechnicians={data.assignedTechnicians}
        status={status}
        submittedAt={submittedAt}
        submittedByName={submittedByName}
        reopenedAt={reopenedAt}
        reopenedByName={reopenedByName}
        readOnly={readOnly}
        callDate={callDate}
        saveStatus={saveStatus}
        onSaveField={saveFieldValue}
        onCallDateSaved={setCallDate}
      />

      {readOnly && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-lg border bg-muted/60 px-3 py-2 text-sm"
        >
          <LockIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Submitted by {submittedByName ?? 'unknown'}
            {submittedAt ? ` on ${formatApp(submittedAt)}` : ''}. This checklist is read-only.{' '}
            {canReopen
              ? 'Use Reopen at the bottom of the page to make changes.'
              : 'Ask a manager to reopen it if something needs to change.'}
          </span>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
        {/* Below lg the score is a compact strip that stays in view above the steps. */}
        <ScoreStrip score={score} className="sticky top-0 z-10 lg:hidden" />
        <ScorePanel
          score={score}
          className="hidden lg:sticky lg:top-4 lg:col-start-2 lg:row-start-1 lg:block lg:self-start"
        />

        <section aria-label="Checklist steps" className="min-w-0 lg:col-start-1 lg:row-start-1">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium">Steps</h2>
            {/* Keyboard help only where there is likely a keyboard. */}
            <div className="hidden items-center gap-2 md:flex">
              <span className="text-xs text-muted-foreground">
                j/k or ↑/↓ to move · y/n/b to answer
              </span>
              <ShortcutsPopover open={helpOpen} onOpenChange={setHelpOpen} />
            </div>
          </div>
          <div
            role="list"
            className="space-y-0.5 rounded-xl bg-card p-1.5 ring-1 ring-foreground/10"
          >
            {STEPS.map((step, index) => {
              const answer = data.answers[step.key];
              const suggested =
                step.autoCheck === 'submitted' ? null : (answer?.autoSuggestedValue ?? null);
              return (
                <StepRow
                  key={step.key}
                  step={step}
                  index={index}
                  text={stepText(step, checklist.type)}
                  value={values[step.key] ?? null}
                  suggested={suggested}
                  evidence={answer?.autoEvidence ?? null}
                  isActive={index === activeIndex}
                  readOnly={readOnly}
                  saving={(pendingSteps[step.key] ?? 0) > 0}
                  rowRef={(el) => {
                    rowRefs.current[index] = el;
                  }}
                  onAnswer={setAnswer}
                  onFocusRow={onFocusRow}
                  onRowKeyDown={handleRowKeyDown}
                  fields={renderFields(step)}
                  hint={
                    step.autoCheck === 'submitted'
                      ? 'Set to Y automatically when the checklist is submitted.'
                      : undefined
                  }
                >
                  {renderExtra(step)}
                </StepRow>
              );
            })}
          </div>

          <div className="mt-4 space-y-2 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
            <Label htmlFor="checklist-notes">Notes/Remarks</Label>
            <AutosaveTextarea
              id="checklist-notes"
              initialValue={checklist.notes ?? ''}
              onSave={(v) => saveFieldValue('notes', v)}
              disabled={readOnly}
              rows={4}
              placeholder="Potential projects (step 29a), call back details, anything management should know."
            />
          </div>
        </section>
      </div>

      <SubmitBar
        answeredCount={answeredCount}
        total={STEPS.length}
        saveStatus={saveStatus}
        submitted={readOnly}
        canReopen={canReopen}
        blankScoringSteps={blanks}
        submittedByName={submittedByName}
        submittedAt={submittedAt}
        submitButtonRef={submitButtonRef}
        onSubmit={handleSubmit}
        onReopen={handleReopen}
        canReset={canReset}
        onReset={handleReset}
      />
    </div>
  );
}
