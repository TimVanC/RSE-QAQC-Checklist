/**
 * Keyboard model of the checklist workspace. Pure functions only (no DOM), so the whole model is
 * unit tested in tests/components/keyboard.test.ts.
 *
 * Roving focus over the step rows:
 *   ArrowDown / j     next step            ArrowUp / k   previous step
 *   Home / End        first / last step
 *   y / n / b         answer the focused step, then move to the next step
 *   Backspace/Delete  clear the focused step
 *   Enter             next step; on the last step, focus the Submit button
 *   Escape            (inside a step's date/text field) back to the step row
 *   ?                 toggle the shortcuts popover
 *
 * Keys are ignored while focus is inside an input, select or textarea, and when Ctrl/Cmd/Alt is held
 * (so browser shortcuts such as Ctrl+N keep working).
 */
import type { AnswerValue } from '@/src/config/checklist-steps';

export interface KeyInput {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

export type KeyAction =
  | { kind: 'focus'; index: number }
  | { kind: 'answer'; value: AnswerValue; focus: number }
  | { kind: 'clear' }
  | { kind: 'submit' }
  | { kind: 'help' };

/** Minimal shape of an event target, so callers can pass a DOM element and tests a plain object. */
export interface TargetLike {
  tagName?: string;
  isContentEditable?: boolean;
  type?: string;
}

const TYPING_TAGS = new Set(['INPUT', 'SELECT', 'TEXTAREA']);

/** True when keystrokes belong to a form control (input, select, textarea, contenteditable). */
export function isTypingTarget(target: TargetLike | null | undefined): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  return TYPING_TAGS.has((target.tagName ?? '').toUpperCase());
}

/** Clamp an index into [0, count - 1]; 0 for an empty list. */
export function clampIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  if (!Number.isFinite(index)) return 0;
  return Math.min(Math.max(Math.trunc(index), 0), count - 1);
}

/** Index after moving by `delta`, clamped (no wrap-around). */
export function moveIndex(index: number, delta: number, count: number): number {
  return clampIndex(clampIndex(index, count) + delta, count);
}

const ANSWER_KEYS: Readonly<Record<string, AnswerValue>> = { y: 'Y', n: 'N', b: 'B' };

/**
 * Map a keydown on step row `index` (of `count` rows) to an action, or null to let the browser handle it.
 * `readOnly` disables answering and clearing but keeps navigation.
 */
export function keyAction(
  input: KeyInput,
  index: number,
  count: number,
  readOnly = false,
): KeyAction | null {
  if (input.ctrlKey || input.metaKey || input.altKey) return null;
  if (count <= 0) return null;
  const i = clampIndex(index, count);
  const key = input.key;

  switch (key) {
    case 'ArrowDown':
    case 'j':
    case 'J':
      return { kind: 'focus', index: moveIndex(i, 1, count) };
    case 'ArrowUp':
    case 'k':
    case 'K':
      return { kind: 'focus', index: moveIndex(i, -1, count) };
    case 'Home':
      return { kind: 'focus', index: 0 };
    case 'End':
      return { kind: 'focus', index: count - 1 };
    case 'Enter':
      return i === count - 1 ? { kind: 'submit' } : { kind: 'focus', index: i + 1 };
    case 'Backspace':
    case 'Delete':
      return readOnly ? null : { kind: 'clear' };
    case '?':
      return { kind: 'help' };
  }

  const value = ANSWER_KEYS[key.toLowerCase()];
  if (value && key.length === 1) {
    return readOnly ? null : { kind: 'answer', value, focus: moveIndex(i, 1, count) };
  }
  return null;
}

/** Escape inside a step's own date/text field hands focus back to the step row. */
export function exitsField(input: KeyInput): boolean {
  return input.key === 'Escape' && !input.ctrlKey && !input.metaKey && !input.altKey;
}

/** Clicking the selected value clears it; clicking another value selects it. */
export function toggleAnswer(
  current: AnswerValue | null,
  clicked: AnswerValue,
): AnswerValue | null {
  return current === clicked ? null : clicked;
}

/** Index of the first step without an answer, or 0 when every step is answered. */
export function firstUnansweredIndex(
  keys: readonly string[],
  values: Readonly<Record<string, AnswerValue | null | undefined>>,
): number {
  const i = keys.findIndex((k) => values[k] == null);
  return i === -1 ? 0 : i;
}
