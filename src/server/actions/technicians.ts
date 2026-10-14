'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getDb } from '@/src/db';
import { technicians } from '@/src/db/schema/hcp';
import { recordAudit } from '@/src/lib/audit';
import { ForbiddenError, requireRole } from '@/src/lib/auth/session';
import type { ActionResult } from './checklists';

const schema = z.object({
  technicianId: z.string().uuid(),
  field: z.enum(['isTechnician', 'active']),
  value: z.boolean(),
});

/**
 * Admin toggle for who appears in the call queue, tracker and production counts. The Housecall Pro
 * sync never overwrites these two flags (see upsertEmployees).
 */
export async function setTechnicianFlag(input: z.infer<typeof schema>): Promise<ActionResult> {
  try {
    const admin = await requireRole('admin');
    const parsed = schema.safeParse(input);
    if (!parsed.success) return { ok: false, error: 'Invalid request.' };
    const { technicianId, field, value } = parsed.data;
    const db = getDb();
    const [before] = await db
      .select({ isTechnician: technicians.isTechnician, active: technicians.active })
      .from(technicians)
      .where(eq(technicians.id, technicianId))
      .limit(1);
    if (!before) return { ok: false, error: 'Technician not found.' };
    await db
      .update(technicians)
      .set({ [field]: value })
      .where(eq(technicians.id, technicianId));
    await recordAudit(db, {
      userId: admin.id,
      entity: 'technician',
      entityId: technicianId,
      action: `set_${field}`,
      before: { [field]: before[field] },
      after: { [field]: value },
    });
    revalidatePath('/admin/technicians');
    revalidatePath('/queue');
    revalidatePath('/tracker');
    revalidatePath('/production');
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, error: err.message };
    if (err instanceof Error && err.name === 'UnauthenticatedError') return { ok: false, error: 'Please sign in again.' };
    console.error('[technicians] action failed', err);
    return { ok: false, error: 'Something went wrong. Please try again.' };
  }
}
