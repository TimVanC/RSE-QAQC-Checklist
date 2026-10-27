import { describe, expect, it } from 'vitest';
import {
  groupActionsByStep,
  isOverdue,
  sortActions,
  stepLabel,
} from '@/src/lib/corrective-actions';

const base = { createdAt: new Date('2026-10-20T00:00:00Z') };

describe('sortActions', () => {
  it('puts open before resolved, earliest due first, no due date last, then oldest first', () => {
    const sorted = sortActions([
      { id: 'resolved', status: 'resolved', dueDate: '2026-10-01', ...base },
      {
        id: 'no-due-new',
        status: 'open',
        dueDate: null,
        createdAt: new Date('2026-10-22T00:00:00Z'),
      },
      { id: 'due-later', status: 'open', dueDate: '2026-11-05', ...base },
      { id: 'no-due-old', status: 'open', dueDate: null, ...base },
      { id: 'due-soon', status: 'open', dueDate: '2026-10-28', ...base },
    ]);
    expect(sorted.map((a) => a.id)).toEqual([
      'due-soon',
      'due-later',
      'no-due-old',
      'no-due-new',
      'resolved',
    ]);
  });
});

describe('isOverdue', () => {
  it('is only true for open actions past their due date', () => {
    expect(isOverdue({ status: 'open', dueDate: '2026-10-26', ...base }, '2026-10-27')).toBe(true);
    expect(isOverdue({ status: 'open', dueDate: '2026-10-27', ...base }, '2026-10-27')).toBe(false);
    expect(isOverdue({ status: 'open', dueDate: null, ...base }, '2026-10-27')).toBe(false);
    expect(isOverdue({ status: 'resolved', dueDate: '2026-10-01', ...base }, '2026-10-27')).toBe(
      false,
    );
  });
});

describe('groupActionsByStep / stepLabel', () => {
  it('groups by step key and labels steps from the config', () => {
    const groups = groupActionsByStep([
      { id: 1, stepKey: 's12' },
      { id: 2, stepKey: 's01' },
      { id: 3, stepKey: 's12' },
    ]);
    expect([...groups.keys()]).toEqual(['s12', 's01']);
    expect(groups.get('s12')).toHaveLength(2);
    expect(stepLabel('s12')).toMatch(/^Step 12 · /);
    expect(stepLabel('nope')).toBe('nope');
  });
});
