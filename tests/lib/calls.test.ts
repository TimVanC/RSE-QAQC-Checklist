import { describe, expect, it } from 'vitest';
import { displayStatus, isCallOutcome, isNotReached, type LastCall } from '@/src/lib/calls';

const t0 = new Date('2026-10-27T01:00:00Z');
const later = new Date('2026-10-27T02:00:00Z');
const earlier = new Date('2026-10-27T00:30:00Z');

function call(outcome: LastCall['outcome'], at = t0): LastCall {
  return { outcome, at, note: null, byName: 'Ana' };
}

describe('isNotReached', () => {
  it('is false without any call attempt', () => {
    expect(isNotReached(null, null)).toBe(false);
    expect(isNotReached({ status: 'in_progress', updatedAt: t0 }, null)).toBe(false);
  });

  it('is true when the last attempt failed and no checklist exists', () => {
    expect(isNotReached(null, call('no_answer'))).toBe(true);
    expect(isNotReached(null, call('callback_later'))).toBe(true);
    expect(isNotReached(null, call('reached'))).toBe(false);
  });

  it('respects the order of the attempt and the last checklist change', () => {
    // Opened the checklist, then logged no answer: still not reached.
    expect(isNotReached({ status: 'in_progress', updatedAt: earlier }, call('no_answer'))).toBe(
      true,
    );
    // Logged no answer, then answered steps: back to in progress.
    expect(isNotReached({ status: 'in_progress', updatedAt: later }, call('no_answer'))).toBe(
      false,
    );
    expect(isNotReached({ status: 'not_started', updatedAt: null }, call('no_answer'))).toBe(true);
  });

  it('never applies to a submitted checklist', () => {
    expect(isNotReached({ status: 'submitted', updatedAt: earlier }, call('no_answer'))).toBe(
      false,
    );
  });
});

describe('displayStatus', () => {
  it('falls back to the checklist status', () => {
    expect(displayStatus(null, null)).toBe('not_started');
    expect(displayStatus({ status: 'in_progress', updatedAt: t0 }, call('reached'))).toBe(
      'in_progress',
    );
    expect(displayStatus({ status: 'submitted', updatedAt: t0 }, call('no_answer'))).toBe(
      'submitted',
    );
    expect(displayStatus(null, call('no_answer'))).toBe('not_reached');
  });

  it('validates outcomes', () => {
    expect(isCallOutcome('reached')).toBe(true);
    expect(isCallOutcome('busy')).toBe(false);
  });
});
