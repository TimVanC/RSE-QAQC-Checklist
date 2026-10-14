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
