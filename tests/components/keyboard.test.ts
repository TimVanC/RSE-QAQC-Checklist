import { describe, expect, it } from 'vitest';
import {
  clampIndex,
  exitsField,
  firstUnansweredIndex,
  isTypingTarget,
  keyAction,
  moveIndex,
  toggleAnswer,
} from '@/components/checklist/keyboard';
import { CHECKLIST_STEPS } from '@/src/config/checklist-steps';

const COUNT = CHECKLIST_STEPS.length; // 44

describe('clampIndex / moveIndex', () => {
  it('clamps into range without wrapping', () => {
    expect(clampIndex(-3, 10)).toBe(0);
    expect(clampIndex(12, 10)).toBe(9);
    expect(clampIndex(4.7, 10)).toBe(4);
    expect(clampIndex(Number.NaN, 10)).toBe(0);
    expect(clampIndex(5, 0)).toBe(0);
    expect(moveIndex(0, -1, 10)).toBe(0);
    expect(moveIndex(9, 1, 10)).toBe(9);
    expect(moveIndex(3, 1, 10)).toBe(4);
  });
});

describe('keyAction: navigation', () => {
  it('moves down with ArrowDown and j', () => {
    expect(keyAction({ key: 'ArrowDown' }, 0, COUNT)).toEqual({ kind: 'focus', index: 1 });
    expect(keyAction({ key: 'j' }, 5, COUNT)).toEqual({ kind: 'focus', index: 6 });
    expect(keyAction({ key: 'J' }, 5, COUNT)).toEqual({ kind: 'focus', index: 6 });
  });

  it('moves up with ArrowUp and k', () => {
    expect(keyAction({ key: 'ArrowUp' }, 3, COUNT)).toEqual({ kind: 'focus', index: 2 });
    expect(keyAction({ key: 'k' }, 3, COUNT)).toEqual({ kind: 'focus', index: 2 });
  });

  it('stays on the first and last rows instead of wrapping', () => {
    expect(keyAction({ key: 'ArrowUp' }, 0, COUNT)).toEqual({ kind: 'focus', index: 0 });
    expect(keyAction({ key: 'j' }, COUNT - 1, COUNT)).toEqual({ kind: 'focus', index: COUNT - 1 });
  });

  it('jumps with Home and End', () => {
    expect(keyAction({ key: 'Home' }, 20, COUNT)).toEqual({ kind: 'focus', index: 0 });
    expect(keyAction({ key: 'End' }, 2, COUNT)).toEqual({ kind: 'focus', index: COUNT - 1 });
  });

  it('Enter moves to the next step, and to Submit from the last step', () => {
    expect(keyAction({ key: 'Enter' }, 0, COUNT)).toEqual({ kind: 'focus', index: 1 });
    expect(keyAction({ key: 'Enter' }, COUNT - 1, COUNT)).toEqual({ kind: 'submit' });
  });

  it('clamps an out-of-range current index before acting', () => {
    expect(keyAction({ key: 'j' }, 99, COUNT)).toEqual({ kind: 'focus', index: COUNT - 1 });
    expect(keyAction({ key: 'Enter' }, 99, COUNT)).toEqual({ kind: 'submit' });
  });
});

describe('keyAction: answering', () => {
  it('y/n/b answer the step and advance', () => {
    expect(keyAction({ key: 'y' }, 0, COUNT)).toEqual({ kind: 'answer', value: 'Y', focus: 1 });
    expect(keyAction({ key: 'n' }, 10, COUNT)).toEqual({ kind: 'answer', value: 'N', focus: 11 });
    expect(keyAction({ key: 'b' }, 32, COUNT)).toEqual({ kind: 'answer', value: 'B', focus: 33 });
  });

  it('accepts upper case (Shift or Caps Lock)', () => {
    expect(keyAction({ key: 'Y' }, 0, COUNT)).toEqual({ kind: 'answer', value: 'Y', focus: 1 });
    expect(keyAction({ key: 'B' }, 0, COUNT)).toEqual({ kind: 'answer', value: 'B', focus: 1 });
  });

  it('answering the last step keeps focus on it', () => {
    expect(keyAction({ key: 'y' }, COUNT - 1, COUNT)).toEqual({
      kind: 'answer',
      value: 'Y',
      focus: COUNT - 1,
    });
  });

  it('Backspace and Delete clear the answer', () => {
    expect(keyAction({ key: 'Backspace' }, 4, COUNT)).toEqual({ kind: 'clear' });
    expect(keyAction({ key: 'Delete' }, 4, COUNT)).toEqual({ kind: 'clear' });
  });

  it('read-only checklists navigate but never answer or clear', () => {
    expect(keyAction({ key: 'y' }, 0, COUNT, true)).toBeNull();
    expect(keyAction({ key: 'Backspace' }, 0, COUNT, true)).toBeNull();
    expect(keyAction({ key: 'j' }, 0, COUNT, true)).toEqual({ kind: 'focus', index: 1 });
  });

  it('? toggles the shortcuts help', () => {
    expect(keyAction({ key: '?' }, 0, COUNT)).toEqual({ kind: 'help' });
  });
});

describe('keyAction: ignored keys', () => {
  it('ignores modifier combinations so browser shortcuts keep working', () => {
    expect(keyAction({ key: 'n', ctrlKey: true }, 0, COUNT)).toBeNull();
    expect(keyAction({ key: 'y', metaKey: true }, 0, COUNT)).toBeNull();
    expect(keyAction({ key: 'ArrowDown', altKey: true }, 0, COUNT)).toBeNull();
  });

  it('ignores unrelated keys and named keys that start with an answer letter', () => {
    expect(keyAction({ key: 'x' }, 0, COUNT)).toBeNull();
    expect(keyAction({ key: 'Tab' }, 0, COUNT)).toBeNull();
    expect(keyAction({ key: ' ' }, 0, COUNT)).toBeNull();
    expect(keyAction({ key: 'NumLock' }, 0, COUNT)).toBeNull();
    expect(keyAction({ key: 'Backquote' }, 0, COUNT)).toBeNull();
  });

  it('does nothing on an empty list', () => {
    expect(keyAction({ key: 'j' }, 0, 0)).toBeNull();
  });
});

describe('isTypingTarget', () => {
  it('is true for inputs, selects, textareas and contenteditable', () => {
    expect(isTypingTarget({ tagName: 'INPUT' })).toBe(true);
    expect(isTypingTarget({ tagName: 'input', type: 'date' })).toBe(true);
    expect(isTypingTarget({ tagName: 'SELECT' })).toBe(true);
    expect(isTypingTarget({ tagName: 'TEXTAREA' })).toBe(true);
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
  });

  it('is false for rows, buttons and nothing', () => {
    expect(isTypingTarget({ tagName: 'DIV' })).toBe(false);
    expect(isTypingTarget({ tagName: 'BUTTON' })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget(undefined)).toBe(false);
  });
});

describe('exitsField', () => {
  it('is Escape without modifiers', () => {
    expect(exitsField({ key: 'Escape' })).toBe(true);
    expect(exitsField({ key: 'Escape', ctrlKey: true })).toBe(false);
    expect(exitsField({ key: 'Enter' })).toBe(false);
  });
});

describe('toggleAnswer', () => {
  it('clears when the selected value is clicked again', () => {
    expect(toggleAnswer('Y', 'Y')).toBeNull();
    expect(toggleAnswer('B', 'B')).toBeNull();
  });

  it('selects a different value', () => {
    expect(toggleAnswer(null, 'N')).toBe('N');
    expect(toggleAnswer('Y', 'N')).toBe('N');
  });
});

describe('firstUnansweredIndex', () => {
  const keys = ['s01', 's02', 's03'];

  it('finds the first blank step', () => {
    expect(firstUnansweredIndex(keys, { s01: 'Y', s02: null, s03: 'N' })).toBe(1);
    expect(firstUnansweredIndex(keys, { s01: 'Y' })).toBe(1);
    expect(firstUnansweredIndex(keys, {})).toBe(0);
  });

  it('falls back to the first step when everything is answered', () => {
    expect(firstUnansweredIndex(keys, { s01: 'Y', s02: 'N', s03: 'B' })).toBe(0);
  });
});

describe('a full keyboard pass', () => {
  it('answers all 44 steps with 44 keypresses and lands on Submit with one Enter', () => {
    let index = 0;
    const answers: Record<number, string> = {};
    for (let n = 0; n < COUNT; n++) {
      const action = keyAction({ key: 'y' }, index, COUNT);
      expect(action?.kind).toBe('answer');
      if (action?.kind !== 'answer') throw new Error('unreachable');
      answers[index] = action.value;
      index = action.focus;
    }
    expect(Object.keys(answers)).toHaveLength(COUNT);
    expect(index).toBe(COUNT - 1);
    expect(keyAction({ key: 'Enter' }, index, COUNT)).toEqual({ kind: 'submit' });
  });
});
