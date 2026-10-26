import { describe, expect, it } from 'vitest';
import {
  accountSetupEmail,
  expiryPhrase,
  passwordResetEmail,
  temporaryPasswordEmail,
} from '@/src/lib/email/templates';

const now = new Date('2026-10-26T20:00:00Z');
const base = {
  name: 'Relene Santos',
  link: 'https://auth.example/reset?token=abc&callbackURL=https%3A%2F%2Frseqaqc.com%2Freset-password',
  expiresAt: new Date('2026-10-26T21:00:00Z'),
  appUrl: 'https://rseqaqc.com',
  now,
};

describe('auth email templates', () => {
  it('account setup welcomes a new user and never says "reset"', () => {
    const m = accountSetupEmail(base);
    expect(m.subject).toBe('Set up your RSE QA/QC Checklist account');
    expect(m.html).toContain('Hi Relene,');
    expect(m.html).toContain('Set your password');
    expect(m.html).toContain('works for 1 hour');
    expect(m.html).toContain('The RSE team');
    expect(m.html.toLowerCase()).not.toContain('reset your password');
    expect(m.text).toContain(base.link);
  });

  it('password reset says so and reassures people who did not ask', () => {
    const m = passwordResetEmail({ ...base, name: 'Ron' });
    expect(m.subject).toBe('Reset your RSE QA/QC Checklist password');
    expect(m.html).toContain('Reset your password');
    expect(m.html).toContain('Hi Ron,');
    expect(m.html).toContain('you can ignore this email');
    expect(m.text).toContain('Reset password: ' + base.link);
  });

  it('escapes HTML in names and links', () => {
    const m = passwordResetEmail({ ...base, name: '<b>Bad</b>', link: 'https://x/?a=1&b=2' });
    expect(m.html).not.toContain('<b>Bad</b>');
    expect(m.html).toContain('&lt;b&gt;Bad&lt;/b&gt;');
    expect(m.html).toContain('href="https://x/?a=1&amp;b=2"');
  });

  it('phrases expiry naturally', () => {
    expect(expiryPhrase(new Date(now.getTime() + 60 * 60_000), now)).toBe('1 hour');
    expect(expiryPhrase(new Date(now.getTime() + 15 * 60_000), now)).toBe('15 minutes');
    expect(expiryPhrase(new Date(now.getTime() + 2 * 60 * 60_000), now)).toBe('2 hours');
    expect(expiryPhrase(new Date(now.getTime() - 1000), now)).toBeNull();
    expect(expiryPhrase(null, now)).toBeNull();
  });

  it('temporary password email carries the details and a sign-in button', () => {
    const m = temporaryPasswordEmail({
      name: 'Relene Santos',
      email: 'relene@example.com',
      temporaryPassword: 'Maple7River!',
      appUrl: 'https://rseqaqc.com',
    });
    expect(m.subject).toBe('Your RSE QA/QC Checklist sign-in details');
    expect(m.html).toContain('Temporary password: Maple7River!');
    expect(m.html).toContain('href="https://rseqaqc.com/login"');
    expect(m.html).toContain('change your password at your convenience');
    expect(m.text).toContain('Sign in: https://rseqaqc.com/login');
  });
});
