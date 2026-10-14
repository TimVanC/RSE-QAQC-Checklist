import { describe, expect, it } from 'vitest';
import { hasRole, isRole } from '@/src/lib/auth/roles';

describe('hasRole', () => {
  it('is hierarchical: admin ⊇ manager ⊇ caller', () => {
    expect(hasRole('admin', 'caller')).toBe(true);
    expect(hasRole('admin', 'manager')).toBe(true);
    expect(hasRole('admin', 'admin')).toBe(true);
    expect(hasRole('manager', 'caller')).toBe(true);
    expect(hasRole('manager', 'manager')).toBe(true);
    expect(hasRole('manager', 'admin')).toBe(false);
    expect(hasRole('caller', 'caller')).toBe(true);
    expect(hasRole('caller', 'manager')).toBe(false);
    expect(hasRole('caller', 'admin')).toBe(false);
  });

  it('validates role strings', () => {
    expect(isRole('admin')).toBe(true);
    expect(isRole('owner')).toBe(false);
    expect(isRole(null)).toBe(false);
  });
});
