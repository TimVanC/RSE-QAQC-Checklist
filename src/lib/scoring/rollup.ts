/**
 * Production rollup over a set of checklists. Reproduces `Employee Production (Monthly)`:
 *
 *   D9  total_service_quotes = SUM(Task1:Task35!C81)
 *   D10 total_in_progress    = SUM(Task1:Task35!C82) - D11
 *   D11 total_completed      = SUM(Task1:Task35!C83)
 *   D14 approved_pct         = SUM(D10:D11) / D9 * 100
 *   D15 declined_pct         = 100 - D14
 *   D16 in_progress_pct      = D10 / D9 * 100
 *   D17 completed_pct        = D11 / D9 * 100
 *   B20 black                = SUM(Task1:Task35!C95)
 *   B21 red                  = SUM(Task1:Task35!C91)
 *   B22 total                = B20 + B21
 *   B23 bottom_line_pct      = B20 / B22 * 100
 *
 * The workbook sums Task tabs only, so callback checklists are excluded from every figure above and
 * reported as their own count. Divisions by zero (#DIV/0! in Excel) are returned as null.
 * Percentages are deliberately unguarded otherwise (the workbook can exceed 100% when step 34 is Y
 * without step 2); the app reproduces the workbook rather than correcting it.
 */
import type { ChecklistType } from '@/src/config/checklist-steps';
import type { ChecklistScore } from './checklist-score';

export interface ScoredChecklist {
  type: ChecklistType;
  score: Pick<
    ChecklistScore,
    'service_quote' | 'in_progress' | 'completed' | 'perfect_task' | 'failures_value'
  >;
  /**
   * Share of this checklist credited to the technician whose figures are being built: 1 (the
   * default, and always the case in the workbook) or the lead/assistant split from
   * src/lib/job-roles.ts. Totals over all technicians use 1 so a shared job counts once.
   */
  weight?: number;
}

export interface ProductionRollup {
  total_service_quotes: number;
  total_in_progress: number;
  total_completed: number;
  approved_pct: number | null;
  declined_pct: number | null;
  in_progress_pct: number | null;
  completed_pct: number | null;
  black: number;
  red: number;
  total: number;
  bottom_line_pct: number | null;
  /** App-only: callback checklists in the input, weighted like the figures above (never part of them). */
  callbacks: number;
  /** App-only: number of task checklists in the input (a count, not weighted). */
  tasks: number;
}

export function rollupProduction(rows: readonly ScoredChecklist[]): ProductionRollup {
  let quotes = 0;
  let inProgressRaw = 0;
  let completed = 0;
  let black = 0;
  let red = 0;
  let tasks = 0;
  let callbacks = 0;

  for (const row of rows) {
    const w = row.weight ?? 1;
    if (row.type !== 'task') {
      callbacks += w;
      continue;
    }
    tasks += 1;
    quotes += w * row.score.service_quote;
    inProgressRaw += w * row.score.in_progress;
    completed += w * row.score.completed;
    black += w * row.score.perfect_task;
    red += w * row.score.failures_value;
  }

  const inProgress = inProgressRaw - completed;
  const total = black + red;
  const approved = quotes === 0 ? null : ((inProgress + completed) / quotes) * 100;

  return {
    total_service_quotes: quotes,
    total_in_progress: inProgress,
    total_completed: completed,
    approved_pct: approved,
    declined_pct: approved === null ? null : 100 - approved,
    in_progress_pct: quotes === 0 ? null : (inProgress / quotes) * 100,
    completed_pct: quotes === 0 ? null : (completed / quotes) * 100,
    black,
    red,
    total,
    bottom_line_pct: total === 0 ? null : (black / total) * 100,
    callbacks,
    tasks,
  };
}
