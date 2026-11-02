import { describe, expect, it } from 'vitest';
import { scoreChecklist } from '@/src/lib/scoring/checklist-score';
import { rollupProduction, type ScoredChecklist } from '@/src/lib/scoring/rollup';
import checklistFixtures from './fixtures/checklists.json';
import rollupFixtures from './fixtures/rollups.json';

type ChecklistFixture = {
  name: string;
  type: 'task' | 'callback';
  answers: Record<string, string>;
};
type RollupFixture = {
  name: string;
  task_checklists: string[];
  callback_checklists: string[];
  expected: Record<string, number | null>;
};

const byName = new Map(
  (checklistFixtures.checklists as ChecklistFixture[]).map((c) => [c.name, c]),
);

function rows(names: string[], type: 'task' | 'callback'): ScoredChecklist[] {
  return names.map((n) => {
    const c = byName.get(n);
    if (!c) throw new Error(`missing fixture ${n}`);
    return { type, score: scoreChecklist(c.answers) };
  });
}

const PCT_KEYS = [
  'approved_pct',
  'declined_pct',
  'in_progress_pct',
  'completed_pct',
  'bottom_line_pct',
];

describe('rollupProduction reproduces Employee Production (Monthly)', () => {
  it.each((rollupFixtures.rollups as RollupFixture[]).map((r) => [r.name, r] as const))(
    '%s',
    (_name, r) => {
      const input = [
        ...rows(r.task_checklists, 'task'),
        ...rows(r.callback_checklists, 'callback'),
      ];
      const actual = rollupProduction(input);
      for (const [key, expected] of Object.entries(r.expected)) {
        const value = actual[key as keyof typeof actual];
        if (expected === null) {
          expect(value, key).toBeNull();
        } else if (PCT_KEYS.includes(key)) {
          expect(value, key).toBeCloseTo(expected, 9);
        } else {
          expect(value, key).toBe(expected);
        }
      }
      expect(actual.callbacks).toBe(r.callback_checklists.length);
      expect(actual.tasks).toBe(r.task_checklists.length);
    },
  );

  it('ignores callback checklists in every workbook figure', () => {
    const tasks = rows(['perfect', 'fail_qaqc_only', 'declined_quote'], 'task');
    const withCallbacks = [...tasks, ...rows(['callback_perfect', 'callback_failed'], 'callback')];
    const a = rollupProduction(tasks);
    const b = rollupProduction(withCallbacks);
    expect({ ...b, callbacks: 0 }).toEqual({ ...a, callbacks: 0 });
    expect(b.callbacks).toBe(2);
  });

  it('weights each checklist by its credit share, and a weight of 1 is the workbook', () => {
    const tasks = rows(['perfect', 'fail_qaqc_only', 'declined_quote'], 'task');
    const workbook = rollupProduction(tasks);
    expect(rollupProduction(tasks.map((t) => ({ ...t, weight: 1 })))).toEqual(workbook);

    // A lead's 60% and an assistant's 40% of the same checklists add up to the workbook figures.
    const lead = rollupProduction(tasks.map((t) => ({ ...t, weight: 0.6 })));
    const assistant = rollupProduction(tasks.map((t) => ({ ...t, weight: 0.4 })));
    for (const key of [
      'total_service_quotes',
      'total_in_progress',
      'total_completed',
      'black',
      'red',
      'total',
    ] as const) {
      expect(lead[key] + assistant[key], key).toBeCloseTo(workbook[key], 9);
    }
    // Percentages are ratios, so a uniform share leaves them unchanged.
    for (const key of PCT_KEYS as Array<'approved_pct'>) {
      if (workbook[key] === null) expect(lead[key]).toBeNull();
      else expect(lead[key]).toBeCloseTo(workbook[key]!, 9);
    }
    expect(lead.tasks).toBe(3);
  });

  it('returns null instead of #DIV/0! for an empty period', () => {
    const r = rollupProduction([]);
    expect(r.total_service_quotes).toBe(0);
    expect(r.approved_pct).toBeNull();
    expect(r.declined_pct).toBeNull();
    expect(r.in_progress_pct).toBeNull();
    expect(r.completed_pct).toBeNull();
    expect(r.bottom_line_pct).toBeNull();
  });

  it('returns null bottom line when there are quotes but neither Black nor Red', () => {
    const r = rollupProduction(rows(['declined_quote', 'in_progress_only'], 'task'));
    expect(r.total_service_quotes).toBe(2);
    expect(r.bottom_line_pct).toBeNull();
    expect(r.approved_pct).toBeCloseTo(50, 9);
    expect(r.declined_pct).toBeCloseTo(50, 9);
  });
});
