'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getDb } from '@/src/db';
import { hcpJobAssignees, technicians } from '@/src/db/schema/hcp';
import { jobRoles } from '@/src/db/schema/job-roles';
import { recordAudit } from '@/src/lib/audit';
import { ForbiddenError, requireRole } from '@/src/lib/auth/session';

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

const schema = z.object({
  hcpJobId: z.string().trim().min(1).max(100),
  /** The technician who led the job, or null to clear the roles. */
  leadTechnicianId: z.string().uuid().nullable(),
});

export type SetLeadInput = z.infer<typeof schema>;

/**
 * Marks who led a shared job: that technician becomes the lead and every other technician assigned
 * to the job in Housecall Pro becomes an assistant, so a job never has two leads. Any signed-in
 * user, since the call team learns this on the call. Null clears the roles.
 */
export async function setLeadTechnician(input: SetLeadInput): Promise<ActionResult> {
  try {
    const user = await requireRole('caller');
    const parsed = schema.safeParse(input);
    if (!parsed.success) return { ok: false, error: 'Invalid request.' };
    const { hcpJobId, leadTechnicianId } = parsed.data;

    const db = getDb();
    // Only people marked as technicians share production credit; office staff on the job do not.
    const assignees = await db
      .select({ technicianId: hcpJobAssignees.technicianId })
      .from(hcpJobAssignees)
      .innerJoin(
        technicians,
        and(eq(technicians.id, hcpJobAssignees.technicianId), eq(technicians.isTechnician, true)),
      )
      .where(eq(hcpJobAssignees.hcpJobId, hcpJobId));
    const ids = assignees.map((a) => a.technicianId);
    if (leadTechnicianId && !ids.includes(leadTechnicianId)) {
      return { ok: false, error: 'That technician is not assigned to this job in Housecall Pro.' };
    }

    const before = await db
      .select({ technicianId: jobRoles.technicianId, role: jobRoles.role })
      .from(jobRoles)
      .where(eq(jobRoles.hcpJobId, hcpJobId));

    const clear = db.delete(jobRoles).where(eq(jobRoles.hcpJobId, hcpJobId));
    if (leadTechnicianId) {
      await db.batch([
        clear,
        db.insert(jobRoles).values(
          ids.map((technicianId) => ({
            hcpJobId,
            technicianId,
            role: technicianId === leadTechnicianId ? ('lead' as const) : ('assistant' as const),
            setBy: user.id,
          })),
        ),
      ]);
    } else {
      await clear;
    }

    await recordAudit(db, {
      userId: user.id,
      entity: 'job_role',
      entityId: hcpJobId,
      action: leadTechnicianId ? 'set_lead' : 'clear_roles',
      before: { roles: before },
      after: { leadTechnicianId, assignees: ids },
    });

    revalidatePath('/queue');
    revalidatePath('/tracker');
    revalidatePath('/production');
    revalidatePath(`/checklists/job/${encodeURIComponent(hcpJobId)}`);
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, error: 'Not allowed.' };
    console.error('setLeadTechnician failed', err);
    return { ok: false, error: 'Could not save the roles. Please try again.' };
  }
}
