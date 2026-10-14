import { describe, expect, it } from 'vitest';
import {
  blankScoringSteps,
  localScore,
  normalizeScore,
  readEvidence,
  rowTone,
  suggestionOutcome,
} from '@/components/checklist/step-state';
import { CHECKLIST_STEPS, getStep } from '@/src/config/checklist-steps';

const step = (key: string) => {
  const s = getStep(key);
  if (!s) throw new Error(`missing step ${key}`);
  return s;
};

describe('rowTone (workbook conditional formatting)', () => {
  it('is red on the four failure answers', () => {
    expect(rowTone(step('s22'), 'Y')).toBe('failure');
    expect(rowTone(step('s23'), 'N')).toBe('failure');
    expect(rowTone(step('s26'), 'N')).toBe('failure');
    expect(rowTone(step('s31'), 'Y')).toBe('failure');
  });

  it('is not red on the passing answers', () => {
    expect(rowTone(step('s22'), 'N')).toBeNull();
    expect(rowTone(step('s23'), 'Y')).toBeNull();
    expect(rowTone(step('s26'), 'Y')).toBeNull();
    expect(rowTone(step('s31'), 'N')).toBeNull();
    expect(rowTone(step('s22'), 'B')).toBeNull();
  });

  it('is amber when step 33 is B and green when step 34 is Y', () => {
    expect(rowTone(step('s33'), 'B')).toBe('warning');
    expect(rowTone(step('s33'), 'Y')).toBeNull();
    expect(rowTone(step('s34'), 'Y')).toBe('success');
    expect(rowTone(step('s34'), 'N')).toBeNull();
  });

  it('ignores blanks and non-scoring steps', () => {
    expect(rowTone(step('s22'), null)).toBeNull();
    expect(rowTone(step('s01'), 'N')).toBeNull();
    expect(rowTone(step('s06a'), 'B')).toBeNull();
  });
});

describe('suggestionOutcome', () => {
  it('reports confirmed / overridden only when both values exist', () => {
    expect(suggestionOutcome('Y', 'Y')).toBe('confirmed');
    expect(suggestionOutcome('Y', 'N')).toBe('overridden');
    expect(suggestionOutcome(null, 'Y')).toBeNull();
    expect(suggestionOutcome('Y', null)).toBeNull();
  });
});

describe('blankScoringSteps', () => {
  it('lists the seven scoring steps in order when nothing is answered', () => {
    expect(blankScoringSteps(CHECKLIST_STEPS, {}).map((s) => s.label)).toEqual([
      '2',
      '17',
      '22',
      '23',
      '26',
      '31',
      '34',
    ]);
  });

  it('drops answered scoring steps (B counts as answered)', () => {
    const blanks = blankScoringSteps(CHECKLIST_STEPS, { s02: 'Y', s22: 'N', s31: 'B', s01: 'Y' });
    expect(blanks.map((s) => s.label)).toEqual(['17', '23', '26', '34']);
  });
});

describe('scores', () => {
  it('local score matches the workbook for an empty and a perfect checklist', () => {
    expect(localScore({}).bottomLine).toBe(4);
    const perfect = localScore({ s22: 'N', s23: 'Y', s26: 'Y', s31: 'N', s34: 'Y' });
    expect(perfect.bottomLine).toBe(5);
    expect(perfect.perfectTask).toBe(1);
    expect(perfect.failuresValue).toBe(0);
  });

  it('normalises camelCase and snake_case score payloads', () => {
    const camel = normalizeScore({
      bottomLine: 3,
      failOpsCheck: 1,
      completedMarks: 12,
      computedAt: new Date(),
    });
    expect(camel?.bottomLine).toBe(3);
    expect(camel?.failOpsCheck).toBe(1);
    expect(camel?.completedMarks).toBe(12);
    const snake = normalizeScore({ bottom_line: 5, perfect_task: 1 });
    expect(snake?.bottomLine).toBe(5);
    expect(snake?.perfectTask).toBe(1);
    expect(normalizeScore(null)).toBeNull();
  });
});

describe('readEvidence', () => {
  it('splits summary and confidence from the tooltip facts', () => {
    const ev = readEvidence({
      summary: 'Started 35 min before the scheduled start',
      confidence: 'high',
      started_at: '2026-07-06T13:25:00.000Z',
      lead_minutes: 35,
      on_my_way_at: null,
      amount_cents: 10000,
    });
    expect(ev.summary).toBe('Started 35 min before the scheduled start');
    expect(ev.confidence).toBe('high');
    expect(ev.details).toEqual([
      { label: 'Started at', value: 'Jul 6, 2026 9:25 AM NJ' },
      { label: 'Lead minutes', value: '35' },
      { label: 'On my way at', value: '—' },
      { label: 'Amount', value: '$100.00' },
    ]);
  });

  it('defaults to high confidence and no summary', () => {
    expect(readEvidence(null)).toEqual({ summary: null, confidence: 'high', details: [] });
    expect(readEvidence({ confidence: 'low' }).confidence).toBe('low');
  });
});
