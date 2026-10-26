/** Writes the two auth email templates to docs/client/email-previews for a quick look in a browser. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { accountSetupEmail, passwordResetEmail } from '../../src/lib/email/templates';

const base = {
  name: 'Relene Santos',
  link: 'https://rseqaqc.com/reset-password?token=example',
  expiresAt: new Date(Date.now() + 3600_000),
  appUrl: 'https://rseqaqc.com',
};
mkdirSync('docs/client/email-previews', { recursive: true });
writeFileSync('docs/client/email-previews/account-setup.html', accountSetupEmail(base).html);
writeFileSync(
  'docs/client/email-previews/password-reset.html',
  passwordResetEmail({ ...base, name: 'Ron Raymond' }).html,
);
console.log('written to docs/client/email-previews');
