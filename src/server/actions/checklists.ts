'use server';

import { and, asc, eq, ne, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { CHECKLIST_CONFIG_VERSION, PROJECT_TYPES, isStepKey } from '@/src/config/checklist-steps';
import { getDb } from '@/src/db';
import { checklistAnswers, checklistScores, checklists, type Checklist } from '@/src/db/schema/checklists';
import { hcpJobAssignees, hcpJobs, technicians } from '@/src/db/schema/hcp';
import { recordAudit } from '@/src/lib/audit';
import { ForbiddenError, requireRole } from '@/src/lib/auth/session';
import { recomputeChecklistScore, toScoreRow } from '@/src/lib/checklists/score-sync';
import { inferProjectType } from '@/src/lib/hcp/project-type';
import { EMPTY_SCORE, normalizeAnswer } from '@/src/lib/scoring/checklist-score';
import { isIsoDate, toAppDate, todayAppDate } from '@/src/lib/time';
import { computeAutoChecksForJob, getTaskChecklistForJob } from '@/src/server/queries/checklists';

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

function fail(error: string): ActionResult<never> {
  return { ok: false, error };
}

function errorMessage(err: unknown): string {
  if (err instanceof ForbiddenError) return err.message;
  if (err instanceof Error && err.name === 'UnauthenticatedError') return 'Please sign in again.';
  console.error('[checklists] action failed', err);
  return 'Something went wrong. Please try again.';
}

const SUBMITTED_MESSAGE = 'This checklist is submitted. A manager must reopen it before it can be edited.';

async function loadEditable(id: string): Promise<Checklist> {
  const db = getDb();
  const [row] = await db.select().from(checklists).where(eq(checklists.id, id)).limit(1);
  if (!row) throw new ForbiddenError('Checklist not found.');
  if (row.status === 'submitted') throw new ForbiddenError(SUBMITTED_MESSAGE);
  return row;
}

/**
 * Touch the checklist only if it is still editable. Used as the write guard right before an
 * answer/field write so a submit that lands in between is honoured (no transactions on neon-http).
 */
async function touchEditable(id: string, now: Date, status: 'in_progress' | null = null): Promise<void> {
  const db = getDb();
  const rows = await db
    .update(checklists)
    .set(status ? { status, updatedAt: now } : { updatedAt: now })
    .where(and(eq(checklists.id, id), ne(checklists.status, 'submitted')))
    .returning({ id: checklists.id });
  if (rows.length === 0) throw new ForbiddenError(SUBMITTED_MESSAGE);
}

/** Store fresh auto-check suggestions without touching manual answers. */
async function refreshAutoSuggestions(checklistId: string, hcpJobId: string): Promise<void> {
  const db = getDb();
  const suggestions = await computeAutoChecksForJob(hcpJobId);
  const now = new Date();
  for (const [stepKey, s] of Object.entries(suggestions)) {
    if (!s || !isStepKey(stepKey)) continue;
    await db
      .insert(checklistAnswers)
      .values({
        checklistId,
        stepKey,
        value: null,
        source: 'manual',
        autoSuggestedValue: s.value,
        autoEvidence: { summary: s.summary, confidence: s.confidence, ...s.evidence },
        autoComputedAt: now,
      })
      .onConflictDoUpdate({
        target: [checklistAnswers.checklistId, checklistAnswers.stepKey],
        set: {
          autoSuggestedValue: s.value,
          autoEvidence: { summary: s.summary, confidence: s.confidence, ...s.evidence },
          autoComputedAt: now,
        },
      });
  }
}

/** Find or create the Appointment/Service Call checklist for a job, then refresh its suggestions. */
export async function openChecklistForJob(hcpJobIdInput: string): Promise<ActionResult<{ id: string; created: boolean }>> {
  try {
    const user = await requireRole('caller');
    const parsedId = z.string().trim().min(1).max(100).safeParse(hcpJobIdInput);
    if (!parsedId.success) return fail('Invalid job.');
    const hcpJobId = parsedId.data;
    const db = getDb();
    const existing = await getTaskChecklistForJob(hcpJobId);
    if (existing) {
      if (existing.status !== 'submitted') await refreshAutoSuggestions(existing.id, hcpJobId);
      return { ok: true, data: { id: existing.id, created: false } };
    }

    const [job] = await db.select().from(hcpJobs).where(eq(hcpJobs.hcpJobId, hcpJobId)).limit(1);
    if (!job) return fail('Job not found. Refresh the call queue and try again.');

    // Deterministic pick for multi-technician jobs (first by name); the caller can change it later.
    const [assignee] = await db
      .select({ id: technicians.id })
      .from(hcpJobAssignees)
      .innerJoin(technicians, eq(technicians.id, hcpJobAssignees.technicianId))
      .where(and(eq(hcpJobAssignees.hcpJobId, hcpJobId), eq(technicians.isTechnician, true)))
      .orderBy(asc(technicians.firstName), asc(technicians.lastName), asc(technicians.id))
      .limit(1);

    const projectDate = job.scheduledStart ? toAppDate(job.scheduledStart) : null;
    const [created] = await db
      .insert(checklists)
      .values({
        hcpJobId,
        technicianId: assignee?.id ?? null,
        type: 'task',
        configVersion: CHECKLIST_CONFIG_VERSION,
        callDate: projectDate ?? todayAppDate(),
        status: 'not_started',
        projectType: inferProjectType({ jobTypeName: job.jobTypeName, tags: job.tags, description: job.description }),
        customerName: job.customerName,
        projectLocation: job.addressFormatted ?? '',
        projectDate,
        referralProjectNo: job.invoiceNumber ?? '',
        createdBy: user.id,
      })
      .onConflictDoNothing()
      .returning();

    const row = created ?? (await getTaskChecklistForJob(hcpJobId));
    if (!row) return fail('Could not create the checklist.');
    if (created) {
      await db.insert(checklistScores).values(toScoreRow(row.id, EMPTY_SCORE)).onConflictDoNothing();
      await recordAudit(db, { userId: user.id, entity: 'checklist', entityId: row.id, action: 'create', after: { type: 'task', hcpJobId } });
    }
    await refreshAutoSuggestions(row.id, hcpJobId);
    return { ok: true, data: { id: row.id, created: Boolean(created) } };
  } catch (err) {
    return fail(errorMessage(err));
  }
}

const answerSchema = z.object({
  checklistId: z.string().uuid(),
  stepKey: z.string().refine(isStepKey, 'unknown step'),
  value: z.enum(['Y', 'N', 'B']).nullable(),
});

export async function saveAnswer(input: z.infer<typeof answerSchema>): Promise<ActionResult<{ score: ReturnType<typeof toScoreRow> }>> {
  try {
    const user = await requireRole('caller');
    const parsed = answerSchema.safeParse(input);
    if (!parsed.success) return fail('Invalid answer.');
    const { checklistId, stepKey } = parsed.data;
    const value = normalizeAnswer(parsed.data.value);
    const db = getDb();
    await loadEditable(checklistId);

    const [existing] = await db
      .select()
      .from(checklistAnswers)
      .where(and(eq(checklistAnswers.checklistId, checklistId), eq(checklistAnswers.stepKey, stepKey)))
      .limit(1);

    const suggested = existing?.autoSuggestedValue ?? null;
    const source = value === null ? 'manual' : suggested === null ? 'manual' : suggested === value ? 'auto_confirmed' : 'auto_overridden';
    const now = new Date();

    // Guard against a submit that landed after loadEditable, then write.
    await touchEditable(checklistId, now, 'in_progress');
    await db
      .insert(checklistAnswers)
      .values({ checklistId, stepKey, value, source, answeredBy: user.id, answeredAt: now })
      .onConflictDoUpdate({
        target: [checklistAnswers.checklistId, checklistAnswers.stepKey],
        set: { value, source, answeredBy: user.id, answeredAt: now },
      });

    const score = await recomputeChecklistScore(db, checklistId);
    await recordAudit(db, {
      userId: user.id,
      entity: 'checklist_answer',
      entityId: `${checklistId}:${stepKey}`,
      action: 'answer',
      before: { value: existing?.value ?? null, source: existing?.source ?? null },
      after: { value, source, suggested },
    });
    return { ok: true, data: { score: toScoreRow(checklistId, score) } };
  } catch (err) {
    return fail(errorMessage(err));
  }
}

const fieldSchema = z.discriminatedUnion('field', [
  z.object({ checklistId: z.string().uuid(), field: z.literal('project_type'), value: z.enum(PROJECT_TYPES).nullable() }),
  z.object({ checklistId: z.string().uuid(), field: z.enum(['customer_name', 'project_location', 'referral_project_no', 'parts_order_no', 'notes']), value: z.string().max(4000) }),
  z.object({
    checklistId: z.string().uuid(),
    field: z.enum(['project_date', 'permit_submitted_on', 'permit_followup_on', 'permit_approved_on', 'parts_received_on', 'call_date']),
    value: z.string().refine((v) => v === '' || isIsoDate(v), 'invalid date').nullable(),
  }),
]);

const FIELD_COLUMNS = {
  project_type: 'projectType',
  customer_name: 'customerName',
  project_location: 'projectLocation',
  referral_project_no: 'referralProjectNo',
  parts_order_no: 'partsOrderNo',
  notes: 'notes',
  project_date: 'projectDate',
  permit_submitted_on: 'permitSubmittedOn',
  permit_followup_on: 'permitFollowupOn',
  permit_approved_on: 'permitApprovedOn',
  parts_received_on: 'partsReceivedOn',
  call_date: 'callDate',
} as const;

export async function saveField(input: z.infer<typeof fieldSchema>): Promise<ActionResult> {
  try {
    const user = await requireRole('caller');
    const parsed = fieldSchema.safeParse(input);
    if (!parsed.success) return fail('Invalid value.');
    const { checklistId, field } = parsed.data;
    const db = getDb();
    const checklist = await loadEditable(checklistId);
    const column = FIELD_COLUMNS[field];
    let value: string | null = parsed.data.value === '' ? null : parsed.data.value;
    if (field === 'call_date' && value === null) return fail('Call date is required.');
    if (['customer_name', 'project_location', 'referral_project_no'].includes(field) && value === null) value = '';
    const before = checklist[column as keyof Checklist];
    const rows = await db
      .update(checklists)
      .set({ [column]: value, updatedAt: new Date() })
      .where(and(eq(checklists.id, checklistId), ne(checklists.status, 'submitted')))
      .returning({ id: checklists.id });
    if (rows.length === 0) throw new ForbiddenError(SUBMITTED_MESSAGE);
    await recordAudit(db, {
      userId: user.id,
      entity: 'checklist',
      entityId: checklistId,
      action: `field:${field}`,
      before: { value: before ?? null },
      after: { value },
    });
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(errorMessage(err));
  }
}

/** Submit: step 33 is set to Y by the action itself (workbook: "Close checklist... submit"). */
export async function submitChecklist(checklistId: string): Promise<ActionResult<{ score: ReturnType<typeof toScoreRow> }>> {
  try {
    const user = await requireRole('caller');
    if (!z.string().uuid().safeParse(checklistId).success) return fail('Invalid checklist.');
    const db = getDb();
    await loadEditable(checklistId);
    const now = new Date();
    // Flip the status first and conditionally, so two submits (or a submit racing a save) cannot both win.
    const flipped = await db
      .update(checklists)
      .set({ status: 'submitted', submittedBy: user.id, submittedAt: now, updatedAt: now })
      .where(and(eq(checklists.id, checklistId), ne(checklists.status, 'submitted')))
      .returning({ id: checklists.id });
    if (flipped.length === 0) return fail('This checklist was already submitted.');

    // Step 33 ("Close checklist... Enter B if Call Back occurred"): the submit is the signature, so it
    // becomes Y unless the caller marked it B, which is kept exactly as the workbook would.
    const stepKey = 's33';
    await db
      .insert(checklistAnswers)
      .values({ checklistId, stepKey, value: 'Y', source: 'auto_confirmed', autoSuggestedValue: 'Y', autoComputedAt: now, answeredBy: user.id, answeredAt: now })
      .onConflictDoUpdate({
        target: [checklistAnswers.checklistId, checklistAnswers.stepKey],
        set: { value: 'Y', source: 'auto_confirmed', autoSuggestedValue: 'Y', autoComputedAt: now, answeredBy: user.id, answeredAt: now },
        setWhere: sql`${checklistAnswers.value} is distinct from 'B'`,
      });
    const score = await recomputeChecklistScore(db, checklistId);
    await recordAudit(db, { userId: user.id, entity: 'checklist', entityId: checklistId, action: 'submit', after: { submittedAt: now.toISOString() } });
    revalidatePath('/queue');
    return { ok: true, data: { score: toScoreRow(checklistId, score) } };
  } catch (err) {
    return fail(errorMessage(err));
  }
}

export async function reopenChecklist(checklistId: string): Promise<ActionResult> {
  try {
    const user = await requireRole('manager');
    if (!z.string().uuid().safeParse(checklistId).success) return fail('Invalid checklist.');
    const db = getDb();
    const [row] = await db.select().from(checklists).where(eq(checklists.id, checklistId)).limit(1);
    if (!row) return fail('Checklist not found.');
    if (row.status !== 'submitted') return fail('This checklist is not submitted.');
    const now = new Date();
    await db
      .update(checklists)
      .set({ status: 'in_progress', reopenedBy: user.id, reopenedAt: now, updatedAt: now })
      .where(eq(checklists.id, checklistId));
    await recordAudit(db, { userId: user.id, entity: 'checklist', entityId: checklistId, action: 'reopen', before: { status: 'submitted' }, after: { status: 'in_progress' } });
    revalidatePath('/queue');
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(errorMessage(err));
  }
}

/** Create a Call Back Checklist linked to a task checklist (step 31 = Y). */
export async function createCallbackChecklist(parentChecklistId: string): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireRole('caller');
    if (!z.string().uuid().safeParse(parentChecklistId).success) return fail('Invalid checklist.');
    const db = getDb();
    const [parent] = await db.select().from(checklists).where(eq(checklists.id, parentChecklistId)).limit(1);
    if (!parent) return fail('Original checklist not found.');
    if (parent.type !== 'task') return fail('Call backs can only be created from an Appointment/Service Call checklist.');
    const [s31] = await db
      .select({ value: checklistAnswers.value })
      .from(checklistAnswers)
      .where(and(eq(checklistAnswers.checklistId, parent.id), eq(checklistAnswers.stepKey, 's31')))
      .limit(1);
    if (s31?.value !== 'Y') return fail('Answer Y on step 31 (callback due to a failed installation) before creating a Call Back checklist.');
    const [created] = await db
      .insert(checklists)
      .values({
        hcpJobId: parent.hcpJobId,
        technicianId: parent.technicianId,
        type: 'callback',
        parentChecklistId: parent.id,
        configVersion: CHECKLIST_CONFIG_VERSION,
        callDate: todayAppDate(),
        status: 'in_progress',
        projectType: parent.projectType,
        customerName: parent.customerName,
        projectLocation: parent.projectLocation,
        projectDate: parent.projectDate,
        referralProjectNo: parent.referralProjectNo,
        createdBy: user.id,
      })
      .returning();
    await db.insert(checklistScores).values(toScoreRow(created.id, EMPTY_SCORE)).onConflictDoNothing();
    await recordAudit(db, { userId: user.id, entity: 'checklist', entityId: created.id, action: 'create_callback', after: { parentChecklistId } });
    return { ok: true, data: { id: created.id } };
  } catch (err) {
    return fail(errorMessage(err));
  }
}
