import 'server-only';
import { inArray } from 'drizzle-orm';
import { getDb } from '@/src/db';
import type { TechnicianRole } from '@/src/db/schema/enums';
import { jobRoles } from '@/src/db/schema/job-roles';

/** Roles set on each job: job id -> technician id -> role. Jobs without roles are absent. */
export async function getRolesForJobs(
  jobIds: readonly string[],
): Promise<Map<string, Map<string, TechnicianRole>>> {
  const out = new Map<string, Map<string, TechnicianRole>>();
  if (jobIds.length === 0) return out;
  const rows = await getDb()
    .select({
      hcpJobId: jobRoles.hcpJobId,
      technicianId: jobRoles.technicianId,
      role: jobRoles.role,
    })
    .from(jobRoles)
    .where(inArray(jobRoles.hcpJobId, [...new Set(jobIds)]));
  for (const r of rows) {
    let byTech = out.get(r.hcpJobId);
    if (!byTech) {
      byTech = new Map();
      out.set(r.hcpJobId, byTech);
    }
    byTech.set(r.technicianId, r.role);
  }
  return out;
}
