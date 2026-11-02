import type { TechnicianRole } from '@/src/db/schema/enums';

export const TECHNICIAN_ROLES: readonly TechnicianRole[] = ['lead', 'assistant'];
export const TECHNICIAN_ROLE_LABELS: Record<TechnicianRole, string> = {
  lead: 'Lead',
  assistant: 'Assistant',
};

/** RSE's rule (Relene, 2026-11-02): lead 60%, assistant 40% of the production credit. */
export const LEAD_SHARE = 0.6;

export interface Assignee {
  technicianId: string;
  role: TechnicianRole | null;
}

export interface CreditShare {
  technicianId: string;
  /** Fraction of the checklist's production credit, in (0, 1]. */
  share: number;
}

/**
 * Production credit per technician on a job.
 *
 * - One technician: 100%, whatever their role.
 * - A lead and one or more assistants: the lead gets LEAD_SHARE, the assistants split the rest.
 * - Several technicians and no lead set: an even split, so the per-technician figures still add up
 *   to one checklist while the job waits for a role (see `rolesNeeded`).
 * - A job where everyone is marked assistant is treated like no lead set.
 * The action that sets roles always demotes the previous lead, but if two leads ever appear they
 * share LEAD_SHARE between them so the shares still sum to 1.
 */
export function creditShares(assignees: readonly Assignee[]): CreditShare[] {
  const ids = [...new Set(assignees.map((a) => a.technicianId))];
  if (ids.length === 0) return [];
  if (ids.length === 1) return [{ technicianId: ids[0], share: 1 }];
  const leads = ids.filter((id) =>
    assignees.some((a) => a.technicianId === id && a.role === 'lead'),
  );
  if (leads.length === 0 || leads.length === ids.length) {
    return ids.map((technicianId) => ({ technicianId, share: 1 / ids.length }));
  }
  const rest = ids.length - leads.length;
  return ids.map((technicianId) => ({
    technicianId,
    share: leads.includes(technicianId) ? LEAD_SHARE / leads.length : (1 - LEAD_SHARE) / rest,
  }));
}

/** True when a shared job has no lead yet, so the 60/40 split cannot be applied. */
export function rolesNeeded(assignees: readonly Assignee[]): boolean {
  const ids = new Set(assignees.map((a) => a.technicianId));
  return ids.size > 1 && !assignees.some((a) => a.role === 'lead');
}

/** Display helper: 0.6 -> "60%". */
export function sharePercent(share: number): string {
  return `${Math.round(share * 100)}%`;
}
