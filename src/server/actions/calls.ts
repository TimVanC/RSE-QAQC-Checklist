'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getDb } from '@/src/db';
import { callLog } from '@/src/db/schema/calls';
import { hcpJobs } from '@/src/db/schema/hcp';
import { recordAudit } from '@/src/lib/audit';
import { ForbiddenError, requireRole } from '@/src/lib/auth/session';
import { CALL_OUTCOMES } from '@/src/lib/calls';
import { isIsoDate, todayAppDate } from '@/src/lib/time';

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

const logCallSchema = z.object({
  hcpJobId: z.string().trim().min(1).max(100),
  outcome: z.enum(CALL_OUTCOMES),
  note: z.string().trim().max(1000).optional(),
  /** Queue date the call was made for; defaults to today in New Jersey. */
  callDate: z.string().optional(),
});

export type LogCallInput = z.infer<typeof logCallSchema>;

/** Record a call attempt (reached / no answer / asked to call back) for a job. Any signed-in user. */
export async function logCall(input: LogCallInput): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireRole('caller');
    const parsed = logCallSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: 'Please choose an outcome.' };
    const { hcpJobId, outcome, note } = parsed.data;
    const callDate =
      parsed.data.callDate && isIsoDate(parsed.data.callDate)
        ? parsed.data.callDate
        : todayAppDate();

    const db = getDb();
    const [job] = await db
      .select({ id: hcpJobs.hcpJobId })
      .from(hcpJobs)
      .where(eq(hcpJobs.hcpJobId, hcpJobId))
      .limit(1);
    if (!job) return { ok: false, error: 'Job not found.' };

    const [row] = await db
      .insert(callLog)
      .values({ hcpJobId, callDate, outcome, note: note || null, calledBy: user.id })
      .returning({ id: callLog.id });
    await recordAudit(db, {
      userId: user.id,
      entity: 'call_log',
      entityId: row.id,
      action: 'log_call',
      after: { hcpJobId, callDate, outcome, hasNote: Boolean(note) },
    });

    revalidatePath('/queue');
    revalidatePath('/tracker');
    revalidatePath(`/checklists/job/${encodeURIComponent(hcpJobId)}`);
    return { ok: true, data: { id: row.id } };
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, error: err.message };
    if (err instanceof Error && err.name === 'UnauthenticatedError') {
      return { ok: false, error: 'Please sign in again.' };
    }
    console.error('[calls] logCall failed', err);
    return { ok: false, error: 'Could not save the call. Please try again.' };
  }
}
