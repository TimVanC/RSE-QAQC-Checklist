/**
 * Call attempt outcomes and the "Not reached" rule, shared by the queue, the tracker and the
 * checklist page. Pure, unit tested in tests/lib/calls.test.ts.
 */
import type { CallOutcome, ChecklistStatus } from '@/src/db/schema/enums';

export type { CallOutcome };

export const CALL_OUTCOMES = ['no_answer', 'callback_later', 'reached'] as const;

export const CALL_OUTCOME_LABELS: Record<CallOutcome, string> = {
  no_answer: 'No answer',
  callback_later: 'Asked to call back',
  reached: 'Reached',
};

export function isCallOutcome(value: unknown): value is CallOutcome {
  return typeof value === 'string' && (CALL_OUTCOMES as readonly string[]).includes(value);
}

/** The newest call attempt for a job, as the queue and tracker need it. */
export interface LastCall {
  outcome: CallOutcome;
  at: Date;
  note: string | null;
  byName: string | null;
}

/** A checklist's status plus "not_reached", for the queue and tracker badges. */
export type ChecklistDisplayStatus = ChecklistStatus | 'not_reached';

/**
 * A job is "not reached" when the latest call attempt did not get through and nothing on its
 * checklist has changed since (no checklist, or the checklist was last touched before that call).
 * A submitted checklist is never "not reached". Answering a step after the attempt moves the job
 * back to In progress without the team having to log a "reached" entry.
 */
export function isNotReached(
  checklist: { status: ChecklistStatus; updatedAt: Date | null } | null,
  last: LastCall | null,
): boolean {
  if (!last || last.outcome === 'reached') return false;
  if (!checklist) return true;
  if (checklist.status === 'submitted') return false;
  return !checklist.updatedAt || checklist.updatedAt.getTime() <= last.at.getTime();
}

export function displayStatus(
  checklist: { status: ChecklistStatus; updatedAt: Date | null } | null,
  last: LastCall | null,
): ChecklistDisplayStatus {
  if (isNotReached(checklist, last)) return 'not_reached';
  return checklist?.status ?? 'not_started';
}
