import type { Role } from '@/src/db/schema/enums';

export const ROLES: readonly Role[] = ['caller', 'manager', 'admin'];

const RANK: Record<Role, number> = { caller: 0, manager: 1, admin: 2 };

/** True when `role` is at least as privileged as `required` (admin ⊇ manager ⊇ caller). */
export function hasRole(role: Role, required: Role): boolean {
  return RANK[role] >= RANK[required];
}

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

export const ROLE_LABELS: Record<Role, string> = {
  caller: 'Caller',
  manager: 'Manager',
  admin: 'Admin',
};

/** What each role can do, in the words shown on the Users page. Each role includes the ones below it. */
export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  caller: 'Works the call queue: opens, fills in and submits checklists and adds call backs.',
  manager:
    'Everything a caller can do, plus the Completion tracker and Production pages, and can reopen or reset a submitted checklist.',
  admin:
    'Everything a manager can do, plus Admin: invite users and set passwords, mark technicians, set pay periods, run syncs and export data.',
};
