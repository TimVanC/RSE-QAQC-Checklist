/**
 * Pure display rules for step rows and the score panel. Mirrors the workbook's conditional
 * formatting (docs/discovery/workbook-analysis.md section 4):
 *   red    M43 = Y (step 22), M44 = N (step 23), M47 = N (step 26), M58 = Y (step 31)
 *   amber  M60 = B (step 33, "Enter B if Call Back occurred")
 *   green  M64 = Y (step 34; the workbook uses orange, the app uses green for "completed")
 */
import type { AnswerValue, ScoringRole, StepDef } from '@/src/config/checklist-steps';
import { scoreChecklist, type ChecklistScore } from '@/src/lib/scoring/checklist-score';
import { formatApp } from '@/src/lib/time';
import type { WorkspaceScore } from './types';

export type RowTone = 'failure' | 'warning' | 'success' | null;

/** The answer that raises each failure flag. */
export const FAILURE_VALUE: Partial<Record<ScoringRole, AnswerValue>> = {
  fail_ops_check: 'Y',
  fail_qaqc: 'N',
  fail_tool_control: 'N',
  fail_callback: 'Y',
};

/** Step 33 (M60): "Enter B if Call Back occurred." */
const CALLBACK_MARK_STEP_KEY = 's33';

export function rowTone(step: StepDef, value: AnswerValue | null): RowTone {
  if (value === null) return null;
  if (step.scoringRole && FAILURE_VALUE[step.scoringRole] === value) return 'failure';
  if (step.key === CALLBACK_MARK_STEP_KEY && value === 'B') return 'warning';
  if (step.scoringRole === 'completed' && value === 'Y') return 'success';
  return null;
}

/** How a saved answer relates to the Housecall Pro suggestion. */
export function suggestionOutcome(
  suggested: AnswerValue | null,
  value: AnswerValue | null,
): 'confirmed' | 'overridden' | null {
  if (suggested === null || value === null) return null;
  return suggested === value ? 'confirmed' : 'overridden';
}

/** Scoring steps (2, 17, 22, 23, 26, 31, 34) that are still blank, in checklist order. */
export function blankScoringSteps(
  steps: readonly StepDef[],
  values: Readonly<Record<string, AnswerValue | null | undefined>>,
): StepDef[] {
  return steps.filter((s) => s.scoringRole && values[s.key] == null);
}

export function toWorkspaceScore(s: ChecklistScore): WorkspaceScore {
  return {
    serviceQuote: s.service_quote,
    inProgress: s.in_progress,
    completed: s.completed,
    failOpsCheck: s.fail_ops_check,
    failQaqc: s.fail_qaqc,
    failToolControl: s.fail_tool_control,
    failCallback: s.fail_callback,
    totalFailures: s.total_failures,
    failuresValue: s.failures_value,
    bottomLine: s.bottom_line,
    perfectTask: s.perfect_task,
    completedMarks: s.completed_marks,
  };
}

/** Optimistic score computed in the browser with the same scorer the server uses. */
export function localScore(
  values: Readonly<Record<string, AnswerValue | null | undefined>>,
): WorkspaceScore {
  return toWorkspaceScore(scoreChecklist(values));
}

/**
 * Accept a score as returned by the server (camelCase row from `toScoreRow`, or the snake_case
 * `ChecklistScore`) and normalise it.
 */
export function normalizeScore(raw: unknown): WorkspaceScore | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const pick = (camel: string, snake: string): number => {
    const v = r[camel] ?? r[snake];
    return typeof v === 'number' ? v : Number(v ?? 0) || 0;
  };
  return {
    serviceQuote: pick('serviceQuote', 'service_quote'),
    inProgress: pick('inProgress', 'in_progress'),
    completed: pick('completed', 'completed'),
    failOpsCheck: pick('failOpsCheck', 'fail_ops_check'),
    failQaqc: pick('failQaqc', 'fail_qaqc'),
    failToolControl: pick('failToolControl', 'fail_tool_control'),
    failCallback: pick('failCallback', 'fail_callback'),
    totalFailures: pick('totalFailures', 'total_failures'),
    failuresValue: pick('failuresValue', 'failures_value'),
    bottomLine: pick('bottomLine', 'bottom_line'),
    perfectTask: pick('perfectTask', 'perfect_task'),
    completedMarks: pick('completedMarks', 'completed_marks'),
  };
}

export interface EvidenceView {
  summary: string | null;
  confidence: 'high' | 'low';
  details: Array<{ label: string; value: string }>;
}

const ISO_INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function humanizeKey(key: string): string {
  const s = key.replace(/_/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatEvidenceValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number' && key.endsWith('_cents')) {
    return (value / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  }
  if (typeof value === 'string' && ISO_INSTANT_RE.test(value)) {
    const formatted = formatApp(value);
    return formatted ? `${formatted} NJ` : value;
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Split stored `auto_evidence` into the one-line summary, confidence and the tooltip facts. */
export function readEvidence(evidence: Record<string, unknown> | null | undefined): EvidenceView {
  const e = evidence ?? {};
  const summary = typeof e.summary === 'string' && e.summary.trim() ? e.summary : null;
  const confidence = e.confidence === 'low' ? 'low' : 'high';
  const details = Object.entries(e)
    .filter(([k]) => k !== 'summary' && k !== 'confidence')
    .map(([k, v]) => ({
      label: humanizeKey(k.replace(/_cents$/, '')),
      value: formatEvidenceValue(k, v),
    }));
  return { summary, confidence, details };
}
