/**
 * Per-checklist scoring. Reproduces the Task tab formulas of the RSE workbook exactly.
 *
 * Task tab cells (see docs/discovery/workbook-analysis.md section 4):
 *   C81 service_quote     = COUNTIF(M11,"Y")
 *   C82 in_progress       = COUNTIF(M36,"Y")
 *   C83 completed         = COUNTIF(M64,"Y")
 *   C86 fail_ops_check    = COUNTIF(M43,"Y")
 *   C87 fail_qaqc         = COUNTIF(M44,"N")
 *   C88 fail_tool_control = COUNTIF(M47,"N")
 *   C89 fail_callback     = COUNTIF(M58,"Y")
 *   C90 total_failures    = COUNTIF(C86:C89,"1")
 *   C91 failures_value    = COUNTIF(C90,">0")                      ("Red")
 *   C94 bottom_line       = COUNTIFS(C83,"1") + COUNTIF(C86:C89,"0")
 *   C95 perfect_task      = COUNTIF(C94,"5")                       ("Black")
 *   M75 completed_marks   = COUNTIF(M10:M64,"Y") + COUNTIF(M43,"N") + COUNTIF(M58,"N")
 *
 * Excel semantics kept on purpose: comparisons are case-insensitive, a blank cell never matches,
 * and "B" never counts as "Y" or "N".
 */
import { STEP_KEY_BY_ROLE, STEP_KEYS, type AnswerValue } from '@/src/config/checklist-steps';

export type Flag = 0 | 1;

export interface ChecklistScore {
  service_quote: Flag;
  in_progress: Flag;
  completed: Flag;
  fail_ops_check: Flag;
  fail_qaqc: Flag;
  fail_tool_control: Flag;
  fail_callback: Flag;
  total_failures: number;
  failures_value: Flag;
  bottom_line: number;
  perfect_task: Flag;
  completed_marks: number;
}

/** step_key -> raw answer. Missing keys and null/empty strings are blanks. */
export type AnswerMap = Readonly<Record<string, string | null | undefined>>;

export function normalizeAnswer(raw: string | null | undefined): AnswerValue | null {
  if (raw == null) return null;
  const v = raw.trim().toUpperCase();
  return v === 'Y' || v === 'N' || v === 'B' ? v : null;
}

function is(answers: AnswerMap, key: string, value: AnswerValue): Flag {
  return normalizeAnswer(answers[key]) === value ? 1 : 0;
}

export function scoreChecklist(answers: AnswerMap): ChecklistScore {
  const k = STEP_KEY_BY_ROLE;
  const service_quote = is(answers, k.service_quote, 'Y');
  const in_progress = is(answers, k.in_progress, 'Y');
  const completed = is(answers, k.completed, 'Y');
  const fail_ops_check = is(answers, k.fail_ops_check, 'Y');
  const fail_qaqc = is(answers, k.fail_qaqc, 'N');
  const fail_tool_control = is(answers, k.fail_tool_control, 'N');
  const fail_callback = is(answers, k.fail_callback, 'Y');

  const flags = [fail_ops_check, fail_qaqc, fail_tool_control, fail_callback];
  const total_failures = flags.reduce<number>((a, b) => a + b, 0);
  const failures_value: Flag = total_failures > 0 ? 1 : 0;
  const bottom_line = completed + flags.filter((f) => f === 0).length;
  const perfect_task: Flag = bottom_line === 5 ? 1 : 0;

  let completed_marks = 0;
  for (const key of STEP_KEYS) {
    if (normalizeAnswer(answers[key]) === 'Y') completed_marks += 1;
  }
  completed_marks += is(answers, k.fail_ops_check, 'N') + is(answers, k.fail_callback, 'N');

  return {
    service_quote,
    in_progress,
    completed,
    fail_ops_check,
    fail_qaqc,
    fail_tool_control,
    fail_callback,
    total_failures,
    failures_value,
    bottom_line,
    perfect_task,
    completed_marks,
  };
}

/** Score of a checklist with no answers: bottom line 4, nothing else set. */
export const EMPTY_SCORE: Readonly<ChecklistScore> = Object.freeze(scoreChecklist({}));
