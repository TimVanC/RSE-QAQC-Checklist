'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { isStepKey } from '@/src/config/checklist-steps';
import { getDb } from '@/src/db';
import { checklists } from '@/src/db/schema/checklists';
import { correctiveActions } from '@/src/db/schema/corrective-actions';
import { recordAudit } from '@/src/lib/audit';
import { ForbiddenError, requireRole } from '@/src/lib/auth/session';
import { isIsoDate } from '@/src/lib/time';

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

function handle(err: unknown, fallback: string): ActionResult<never> {
  if (err instanceof ForbiddenError) return { ok: false, error: err.message };
  if (err instanceof Error && err.name === 'UnauthenticatedError') {
    return { ok: false, error: 'Please sign in again.' };
  }
  console.error('[corrective-actions]', err);
  return { ok: false, error: fallback };
}

function revalidate(hcpJobId: string, checklistId: string) {
  revalidatePath('/tracker');
  revalidatePath(`/checklists/${checklistId}`);
  revalidatePath(`/checklists/job/${encodeURIComponent(hcpJobId)}`);
}

const createSchema = z.object({
  checklistId: z.string().uuid(),
  stepKey: z.string().refine(isStepKey, 'Unknown step.'),
  description: z.string().trim().min(1, 'Describe what needs to happen.').max(1000),
  owner: z.string().trim().max(120).default(''),
  dueDate: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && isIsoDate(v) ? v : null)),
});

export type CreateCorrectiveActionInput = z.input<typeof createSchema>;

/** Attach a follow-up to a step. Any signed-in user; allowed on submitted checklists too. */
export async function createCorrectiveAction(
  input: CreateCorrectiveActionInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireRole('caller');
    const parsed = createSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the form.' };
    }
    const { checklistId, stepKey, description, owner, dueDate } = parsed.data;
    const db = getDb();
    const [checklist] = await db
      .select({ id: checklists.id, hcpJobId: checklists.hcpJobId })
      .from(checklists)
      .where(eq(checklists.id, checklistId))
      .limit(1);
    if (!checklist) return { ok: false, error: 'Checklist not found.' };

    const [row] = await db
      .insert(correctiveActions)
      .values({ checklistId, stepKey, description, owner, dueDate, createdBy: user.id })
      .returning({ id: correctiveActions.id });
    await recordAudit(db, {
      userId: user.id,
      entity: 'corrective_action',
      entityId: row.id,
      action: 'create',
      after: { checklistId, stepKey, owner, dueDate },
    });
    revalidate(checklist.hcpJobId, checklistId);
    return { ok: true, data: { id: row.id } };
  } catch (err) {
    return handle(err, 'Could not save the follow-up. Please try again.');
  }
}

const resolveSchema = z.object({
  id: z.string().uuid(),
  note: z.string().trim().max(1000).optional(),
});

/** Mark a follow-up resolved with an optional note. Managers and admins. */
export async function resolveCorrectiveAction(
  input: z.infer<typeof resolveSchema>,
): Promise<ActionResult> {
  try {
    const user = await requireRole('manager');
    const parsed = resolveSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: 'Check the form.' };
    const { id, note } = parsed.data;
    const db = getDb();
    const now = new Date();
    const [row] = await db
      .update(correctiveActions)
      .set({
        status: 'resolved',
        resolutionNote: note || null,
        resolvedBy: user.id,
        resolvedAt: now,
      })
      .where(eq(correctiveActions.id, id))
      .returning({ checklistId: correctiveActions.checklistId });
    if (!row) return { ok: false, error: 'Follow-up not found.' };
    const [checklist] = await db
      .select({ hcpJobId: checklists.hcpJobId })
      .from(checklists)
      .where(eq(checklists.id, row.checklistId))
      .limit(1);
    await recordAudit(db, {
      userId: user.id,
      entity: 'corrective_action',
      entityId: id,
      action: 'resolve',
      before: { status: 'open' },
      after: { status: 'resolved', hasNote: Boolean(note) },
    });
    revalidate(checklist?.hcpJobId ?? '', row.checklistId);
    return { ok: true, data: undefined };
  } catch (err) {
    return handle(err, 'Could not resolve the follow-up. Please try again.');
  }
}

/** Put a resolved follow-up back to open. Managers and admins. */
export async function reopenCorrectiveAction(id: string): Promise<ActionResult> {
  try {
    const user = await requireRole('manager');
    if (!z.string().uuid().safeParse(id).success) return { ok: false, error: 'Check the form.' };
    const db = getDb();
    const [row] = await db
      .update(correctiveActions)
      .set({ status: 'open', resolutionNote: null, resolvedBy: null, resolvedAt: null })
      .where(eq(correctiveActions.id, id))
      .returning({ checklistId: correctiveActions.checklistId });
    if (!row) return { ok: false, error: 'Follow-up not found.' };
    const [checklist] = await db
      .select({ hcpJobId: checklists.hcpJobId })
      .from(checklists)
      .where(eq(checklists.id, row.checklistId))
      .limit(1);
    await recordAudit(db, {
      userId: user.id,
      entity: 'corrective_action',
      entityId: id,
      action: 'reopen',
      before: { status: 'resolved' },
      after: { status: 'open' },
    });
    revalidate(checklist?.hcpJobId ?? '', row.checklistId);
    return { ok: true, data: undefined };
  } catch (err) {
    return handle(err, 'Could not reopen the follow-up. Please try again.');
  }
}
