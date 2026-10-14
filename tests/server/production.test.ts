import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  buildProduction,
  toScoredChecklist,
  type ProductionChecklistRow,
  type ProductionTechnician,
} from '@/src/server/queries/production';

const TECHS: ProductionTechnician[] = [
  { id: 't-marcus', firstName: 'Marcus', lastName: 'Rivera', isTechnician: true, active: true },
  { id: 't-dana', firstName: 'Dana', lastName: 'Okafor', isTechnician: true, active: true },
  { id: 't-kevin', firstName: 'Kevin', lastName: 'Walsh', isTechnician: true, active: false },
  { id: 't-old', firstName: 'Olivia', lastName: 'Gone', isTechnician: true, active: false },
  { id: 't-relene', firstName: 'Relene', lastName: 'Santos', isTechnician: false, active: true },
];

/** [service_quote, in_progress, completed, failures_value (red), perfect_task (black)] */
type Score = [number, number, number, number, number];

function cl(
  technicianId: string | null,
  score: Score | null,
  opts: { type?: 'task' | 'callback'; status?: ProductionChecklistRow['status'] } = {},
): ProductionChecklistRow {
  const [serviceQuote, inProgress, completed, failuresValue, perfectTask] = score ?? [
    null,
    null,
    null,
    null,
    null,
  ];
  return {
    technicianId,
    type: opts.type ?? 'task',
    status: opts.status ?? 'submitted',
    serviceQuote,
    inProgress,
    completed,
    perfectTask,
    failuresValue,
  };
}

// The Excel-recalculated scenarios in docs/discovery/workbook-analysis.md section 6.
const WORKBOOK: Record<string, Score> = {
  task1: [1, 1, 1, 0, 1],
  task2: [1, 1, 1, 1, 0],
  task3: [1, 0, 0, 0, 0],
  task4: [1, 1, 0, 0, 0],
  task5: [1, 1, 1, 0, 1],
  task6: [1, 1, 1, 1, 0],
  task7: [1, 1, 1, 1, 0],
  task8: [1, 1, 1, 0, 1],
  task9: [0, 0, 0, 0, 0],
  callback1: [1, 1, 1, 0, 1],
};

describe('toScoredChecklist', () => {
  it('maps score columns and treats a missing score row as blank', () => {
    expect(toScoredChecklist(cl('t-dana', [1, 1, 0, 1, 0]))).toEqual({
      type: 'task',
      score: { service_quote: 1, in_progress: 1, completed: 0, perfect_task: 0, failures_value: 1 },
    });
    expect(toScoredChecklist(cl('t-dana', null)).score).toEqual({
      service_quote: 0,
      in_progress: 0,
      completed: 0,
      perfect_task: 0,
      failures_value: 0,
    });
  });
});

describe('buildProduction', () => {
  const rows: ProductionChecklistRow[] = [
    cl('t-marcus', WORKBOOK.task1),
    cl('t-marcus', WORKBOOK.task2),
    cl('t-marcus', WORKBOOK.task3, { status: 'in_progress' }),
    cl('t-marcus', WORKBOOK.task4),
    cl('t-marcus', WORKBOOK.callback1, { type: 'callback' }),
    cl('t-dana', WORKBOOK.task5),
    cl('t-dana', WORKBOOK.task6),
    cl('t-dana', WORKBOOK.task7, { status: 'not_started' }),
    cl('t-kevin', WORKBOOK.task8),
    cl(null, WORKBOOK.task9, { status: 'in_progress' }),
  ];

  it('reproduces the workbook monthly rollup in the totals row (callbacks excluded)', () => {
    const { totals } = buildProduction(TECHS, rows);
    expect(totals.rollup).toMatchObject({
      total_service_quotes: 8,
      total_in_progress: 1,
      total_completed: 6,
      approved_pct: 87.5,
      declined_pct: 12.5,
      in_progress_pct: 12.5,
      completed_pct: 75,
      black: 3,
      red: 3,
      total: 6,
      bottom_line_pct: 50,
      callbacks: 1,
      tasks: 9,
    });
    expect(totals.submitted).toBe(7);
    expect(totals.checklists).toBe(10);
  });

  it('builds one row per technician in name order, with unassigned checklists last', () => {
    const production = buildProduction(TECHS, rows);
    // Active technicians always; inactive Kevin only because he has checklists; Olivia and Relene omitted.
    expect(production.rows.map((r) => r.name)).toEqual([
      'Dana Okafor',
      'Kevin Walsh',
      'Marcus Rivera',
      'No technician',
    ]);
    const [dana, kevin, marcus, none] = production.rows;

    expect(marcus.rollup).toMatchObject({
      total_service_quotes: 4,
      total_in_progress: 1,
      total_completed: 2,
      approved_pct: 75,
      declined_pct: 25,
      black: 1,
      red: 1,
      bottom_line_pct: 50,
      callbacks: 1,
      tasks: 4,
    });
    expect(marcus.submitted).toBe(4);
    expect(marcus.checklists).toBe(5);

    expect(dana.rollup).toMatchObject({
      total_service_quotes: 3,
      total_in_progress: 0,
      total_completed: 3,
      approved_pct: 100,
      completed_pct: 100,
      black: 1,
      red: 2,
      callbacks: 0,
    });
    expect(dana.rollup.bottom_line_pct).toBeCloseTo(33.333, 3);
    expect(dana.submitted).toBe(2);

    expect(kevin.rollup).toMatchObject({ total_service_quotes: 1, black: 1, bottom_line_pct: 100 });

    expect(none.technicianId).toBeNull();
    expect(none.rollup).toMatchObject({
      total_service_quotes: 0,
      approved_pct: null,
      declined_pct: null,
      in_progress_pct: null,
      completed_pct: null,
      bottom_line_pct: null,
    });
  });

  it('lists active technicians with empty rollups when there are no checklists', () => {
    const production = buildProduction(TECHS, []);
    expect(production.rows.map((r) => r.technicianId)).toEqual(['t-dana', 't-marcus']);
    expect(production.rows[0]).toMatchObject({ submitted: 0, checklists: 0 });
    expect(production.rows[0].rollup).toMatchObject({
      total_service_quotes: 0,
      approved_pct: null,
      bottom_line_pct: null,
      callbacks: 0,
    });
    expect(production.totals.checklists).toBe(0);
  });

  it('puts checklists of an unknown technician id under the unassigned row', () => {
    const production = buildProduction(TECHS, [cl('t-deleted', WORKBOOK.task1)]);
    expect(production.rows.at(-1)).toMatchObject({ technicianId: null, checklists: 1 });
  });
});
