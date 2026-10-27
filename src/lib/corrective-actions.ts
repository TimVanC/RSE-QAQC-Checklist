/**
 * Corrective action shapes and ordering shared by the checklist page and the tracker.
 * Pure, unit tested in tests/lib/corrective-actions.test.ts.
 */
import { CHECKLIST_STEPS } from '@/src/config/checklist-steps';
import type { ActionStatus } from '@/src/db/schema/enums';
import { compareDates, type IsoDate } from './time';

export type { ActionStatus };

export const ACTION_STATUS_LABELS: Record<ActionStatus, string> = {
  open: 'Open',
  resolved: 'Resolved',
};

export interface ActionLike {
  status: ActionStatus;
  dueDate: IsoDate | null;
  createdAt: Date | string;
}

/** Open before resolved; then earliest due date first (no due date last); then oldest first. */
export function compareActions(a: ActionLike, b: ActionLike): number {
  if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
  if (a.dueDate !== b.dueDate) {
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return compareDates(a.dueDate, b.dueDate);
  }
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}

export function sortActions<T extends ActionLike>(actions: readonly T[]): T[] {
  return [...actions].sort(compareActions);
}

/** Open and past its due date (strictly before `today`). */
export function isOverdue(action: ActionLike, today: IsoDate): boolean {
  return action.status === 'open' && !!action.dueDate && compareDates(action.dueDate, today) < 0;
}

export function groupActionsByStep<T extends { stepKey: string }>(
  actions: readonly T[],
): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const a of actions) {
    const list = out.get(a.stepKey);
    if (list) list.push(a);
    else out.set(a.stepKey, [a]);
  }
  return out;
}

/** "12 · Permit submitted" style label for a step key; falls back to the key. */
export function stepLabel(stepKey: string): string {
  const step = CHECKLIST_STEPS.find((s) => s.key === stepKey);
  if (!step) return stepKey;
  const text = step.text.length > 60 ? `${step.text.slice(0, 57).trimEnd()}…` : step.text;
  return `Step ${step.label} · ${text}`;
}
