import { eq } from 'drizzle-orm';
import type { Db } from '@/src/db';
import { checklistAnswers, checklistScores } from '@/src/db/schema/checklists';
import { scoreChecklist, type ChecklistScore } from '@/src/lib/scoring/checklist-score';

export function toScoreRow(checklistId: string, s: ChecklistScore, computedAt = new Date()) {
  return {
    checklistId,
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
    computedAt,
  };
}

/** Recompute and store the workbook scores for one checklist from its stored answers. */
export async function recomputeChecklistScore(db: Db, checklistId: string): Promise<ChecklistScore> {
  const rows = await db
    .select({ stepKey: checklistAnswers.stepKey, value: checklistAnswers.value })
    .from(checklistAnswers)
    .where(eq(checklistAnswers.checklistId, checklistId));
  const answers: Record<string, string | null> = {};
  for (const r of rows) answers[r.stepKey] = r.value;
  const score = scoreChecklist(answers);
  const row = toScoreRow(checklistId, score);
  const update: Partial<typeof row> = { ...row };
  delete update.checklistId;
  await db.insert(checklistScores).values(row).onConflictDoUpdate({ target: checklistScores.checklistId, set: update });
  return score;
}
