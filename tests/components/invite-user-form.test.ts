/**
 * Server-render smoke test of the invite form: emailing is the default and the opt-out checkbox
 * reads as such, so an admin who leaves everything alone gets the set-password email flow.
 */
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock('@/src/server/actions/users', () => ({ inviteUser: vi.fn() }));

const { InviteUserForm } = await import('@/app/(app)/admin/users/invite-user-form');

describe('InviteUserForm', () => {
  const html = renderToString(createElement(InviteUserForm));

  it('defaults to emailing the new user', () => {
    expect(html).toMatch(/id="invite-skip-email"(?![^>]*checked)/);
    expect(html).toContain('Leave blank to email a set-password link');
  });

  it('offers the opt-out that reveals the sign-in details instead', () => {
    expect(html).toContain('email them. Show me the sign-in details');
    expect(html).not.toContain('data-sign-in-details');
  });
});
