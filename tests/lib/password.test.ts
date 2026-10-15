import { describe, expect, it } from 'vitest';
import { generateTemporaryPassword, validatePassword } from '@/src/lib/auth/password';

describe('validatePassword', () => {
  it('enforces length and non-blank', () => {
    expect(validatePassword('short')).toMatch(/at least 8/);
    expect(validatePassword('        ')).toBe('Password cannot be blank.');
    expect(validatePassword('x'.repeat(129))).toMatch(/at most 128/);
    expect(validatePassword('correct horse')).toBeNull();
  });
});

describe('generateTemporaryPassword', () => {
  it('produces three readable groups and passes the policy', () => {
    const pw = generateTemporaryPassword();
    expect(pw).toMatch(/^[A-Za-z2-9]{4}-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}$/);
    expect(pw).not.toMatch(/[0OIl1]/);
    expect(validatePassword(pw)).toBeNull();
  });

  it('is deterministic for a given random source', () => {
    expect(generateTemporaryPassword(() => 0)).toBe('AAAA-AAAA-AAAA');
  });
});
