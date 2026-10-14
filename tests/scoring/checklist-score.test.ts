import { describe, expect, it } from 'vitest';
import { EMPTY_SCORE, normalizeAnswer, scoreChecklist } from '@/src/lib/scoring/checklist-score';
import fixtures from './fixtures/checklists.json';

type Fixture = {
  name: string;
  type: 'task' | 'callback';
  answers: Record<string, string>;
  expected: Record<string, number | null>;
};

const cases = fixtures.checklists as Fixture[];

describe('scoreChecklist reproduces the workbook (Excel-computed fixtures)', () => {
  it('has the expected number of fixtures', () => {
    expect(cases.length).toBe(68);
  });

  it.each(cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    const actual = scoreChecklist(c.answers);
    expect(actual).toEqual(c.expected);
  });
});

describe('scoreChecklist semantics', () => {
  it('scores an empty checklist as bottom line 4, not Black, not Red', () => {
    expect(EMPTY_SCORE).toEqual({
      service_quote: 0,
      in_progress: 0,
      completed: 0,
      fail_ops_check: 0,
      fail_qaqc: 0,
      fail_tool_control: 0,
      fail_callback: 0,
      total_failures: 0,
      failures_value: 0,
      bottom_line: 4,
      perfect_task: 0,
      completed_marks: 0,
    });
  });

  it('treats blank, unknown and B answers as not Y and not N', () => {
    expect(scoreChecklist({ s23: '', s26: null, s22: 'X', s31: 'B' }).total_failures).toBe(0);
  });

  it('is case-insensitive and trims, like COUNTIF', () => {
    const s = scoreChecklist({ s02: ' y ', s17: 'Y', s34: 'y', s23: 'n' });
    expect(s.service_quote).toBe(1);
    expect(s.completed).toBe(1);
    expect(s.fail_qaqc).toBe(1);
    expect(s.bottom_line).toBe(4);
  });

  it('is Black only when completed with four clean flags', () => {
    expect(scoreChecklist({ s34: 'Y' }).perfect_task).toBe(1);
    expect(scoreChecklist({ s34: 'Y', s26: 'N' }).perfect_task).toBe(0);
    expect(scoreChecklist({ s26: 'Y' }).perfect_task).toBe(0);
  });

  it('counts completed marks over all 44 answers plus N on steps 22 and 31', () => {
    const allY = Object.fromEntries(Object.keys(fixtures.meta.cells).map((k) => [k, 'Y']));
    expect(scoreChecklist(allY).completed_marks).toBe(44);
    expect(scoreChecklist({ ...allY, s22: 'N', s31: 'N' }).completed_marks).toBe(44);
    expect(scoreChecklist({ s22: 'N', s31: 'N' }).completed_marks).toBe(2);
  });
});

describe('normalizeAnswer', () => {
  it('maps valid values and rejects the rest', () => {
    expect(normalizeAnswer('y')).toBe('Y');
    expect(normalizeAnswer(' N')).toBe('N');
    expect(normalizeAnswer('b ')).toBe('B');
    expect(normalizeAnswer('')).toBeNull();
    expect(normalizeAnswer('yes')).toBeNull();
    expect(normalizeAnswer(undefined)).toBeNull();
  });
});
