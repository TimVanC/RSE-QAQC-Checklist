'use server';

import { and, eq, ne } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { getDb } from '@/src/db';
import { checklistAnswers, checklists } from '@/src/db/schema/checklists';
import { recordAudit } from '@/src/lib/audit';
import { ForbiddenError, requireRole } from '@/src/lib/auth/session';
import { recomputeChecklistScore, toScoreRow } from '@/src/lib/checklists/score-sync';
import { readCsvCells, type SheetCells } from '@/src/lib/workbook/cells';
import { candidateSheets, extractChecklist, type SheetSummary } from '@/src/lib/workbook/extract';
import { readXlsx } from '@/src/lib/workbook/xlsx';

// Not exported: a 'use server' module may only export async functions.
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export type ImportWorkbookResult =
  | { ok: true; data: { answers: number; fields: number; problems: string[]; sheet: string } }
  | { ok: true; needsSheet: SheetSummary[] }
  | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FIELD_COLUMNS = {
  customer_name: 'customerName',
  project_type: 'projectType',
  project_date: 'projectDate',
  project_location: 'projectLocation',
  referral_project_no: 'referralProjectNo',
  notes: 'notes',
  permit_submitted_on: 'permitSubmittedOn',
  permit_followup_on: 'permitFollowupOn',
  permit_approved_on: 'permitApprovedOn',
  parts_received_on: 'partsReceivedOn',
  parts_order_no: 'partsOrderNo',
} as const;

/**
 * Fill a checklist from the spreadsheet the team used as a fallback. Form fields: `checklistId`,
 * `file` (.xlsx or .csv) and optionally `sheet` (tab name) when the workbook holds several filled
 * tabs. Only cells with a value are written; existing answers for other steps are left alone.
 */
export async function importWorkbook(formData: FormData): Promise<ImportWorkbookResult> {
  try {
    const user = await requireRole('caller');
    const checklistId = String(formData.get('checklistId') ?? '');
    const sheetName = formData.get('sheet');
    const file = formData.get('file');
    if (!UUID_RE.test(checklistId)) return { ok: false, error: 'Invalid checklist.' };
    if (!(file instanceof File) || file.size === 0)
      return { ok: false, error: 'Choose a file first.' };
    if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: 'That file is larger than 8 MB.' };

    const db = getDb();
    const [checklist] = await db
      .select()
      .from(checklists)
      .where(eq(checklists.id, checklistId))
      .limit(1);
    if (!checklist) return { ok: false, error: 'Checklist not found.' };
    if (checklist.status === 'submitted') {
      return { ok: false, error: 'This checklist is submitted. A manager must reopen it first.' };
    }

    const name = file.name.toLowerCase();
    let sheets: SheetCells[];
    if (name.endsWith('.csv')) {
      sheets = [{ name: file.name, cells: readCsvCells(await file.text()) }];
    } else if (name.endsWith('.xlsx') || name.endsWith('.xlsm')) {
      sheets = readXlsx(new Uint8Array(await file.arrayBuffer()));
    } else {
      return {
        ok: false,
        error: 'Upload the Excel workbook (.xlsx) or a CSV of the checklist tab.',
      };
    }

    let chosen: SheetCells | undefined;
    if (typeof sheetName === 'string' && sheetName) {
      chosen = sheets.find((s) => s.name === sheetName);
      if (!chosen) return { ok: false, error: `Tab "${sheetName}" was not found in the file.` };
    } else {
      const candidates = candidateSheets(sheets, checklist.type);
      if (candidates.length === 0) {
        return { ok: false, error: 'No filled-in checklist tab was found in that file.' };
      }
      if (candidates.length > 1) return { ok: true, needsSheet: candidates };
      chosen = sheets.find((s) => s.name === candidates[0].name);
    }
    if (!chosen) return { ok: false, error: 'Could not read the chosen tab.' };

    const extracted = extractChecklist(chosen.cells);
    const answerEntries = Object.entries(extracted.answers);
    const fieldEntries = Object.entries(extracted.fields).filter(([, v]) => v !== undefined);
    if (answerEntries.length === 0 && fieldEntries.length === 0) {
      return {
        ok: false,
        error: `Tab "${chosen.name}" has no answers or header fields filled in.`,
      };
    }

    const now = new Date();
    // Write guard: a submit that lands between the read above and here is honoured.
    const touched = await db
      .update(checklists)
      .set({
        status: 'in_progress',
        updatedAt: now,
        ...Object.fromEntries(
          fieldEntries.map(([k, v]) => [FIELD_COLUMNS[k as keyof typeof FIELD_COLUMNS], v]),
        ),
      })
      .where(and(eq(checklists.id, checklistId), ne(checklists.status, 'submitted')))
      .returning({ id: checklists.id });
    if (touched.length === 0) throw new ForbiddenError('This checklist was submitted meanwhile.');

    const existing = await db
      .select({
        stepKey: checklistAnswers.stepKey,
        autoSuggestedValue: checklistAnswers.autoSuggestedValue,
      })
      .from(checklistAnswers)
      .where(eq(checklistAnswers.checklistId, checklistId));
    const suggestedByStep = new Map(existing.map((e) => [e.stepKey, e.autoSuggestedValue]));

    for (const [stepKey, value] of answerEntries) {
      const suggested = suggestedByStep.get(stepKey) ?? null;
      const source =
        suggested === null ? 'manual' : suggested === value ? 'auto_confirmed' : 'auto_overridden';
      await db
        .insert(checklistAnswers)
        .values({ checklistId, stepKey, value, source, answeredBy: user.id, answeredAt: now })
        .onConflictDoUpdate({
          target: [checklistAnswers.checklistId, checklistAnswers.stepKey],
          set: { value, source, answeredBy: user.id, answeredAt: now },
        });
    }

    const score = await recomputeChecklistScore(db, checklistId);
    await recordAudit(db, {
      userId: user.id,
      entity: 'checklist',
      entityId: checklistId,
      action: 'import_workbook',
      after: {
        file: file.name,
        sheet: chosen.name,
        answers: answerEntries.length,
        fields: fieldEntries.map(([k]) => k),
        problems: extracted.problems.length,
        score: toScoreRow(checklistId, score),
      },
    });

    revalidatePath(`/checklists/${checklistId}`);
    revalidatePath('/queue');
    revalidatePath('/tracker');
    return {
      ok: true,
      data: {
        answers: answerEntries.length,
        fields: fieldEntries.length,
        problems: extracted.problems,
        sheet: chosen.name,
      },
    };
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, error: err.message };
    if (err instanceof Error && err.name === 'UnauthenticatedError') {
      return { ok: false, error: 'Please sign in again.' };
    }
    if (err instanceof Error && /workbook|worksheets/i.test(err.message))
      return { ok: false, error: err.message };
    console.error('[import-workbook] failed', err);
    return { ok: false, error: 'Could not read that file. Please try again.' };
  }
}
