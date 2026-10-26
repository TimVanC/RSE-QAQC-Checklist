/**
 * Branded transactional emails. Pure functions: they take the facts and return subject, HTML and
 * plain text, so they can be unit tested and previewed without sending anything.
 *
 * Two messages share one layout:
 * - account setup: a person was just invited and has never signed in
 * - password reset: an existing user asked for a new password
 */

export const BRAND = {
  appName: 'RSE QA/QC Checklist',
  company: 'RSE Energy Group',
  signoff: 'The RSE team',
  /** Public URL of the logo shown in the header (public/brand/email-logo.png, 480x154). */
  logoUrl:
    process.env.EMAIL_LOGO_URL ??
    `${(process.env.NEXT_PUBLIC_APP_URL ?? 'https://rseqaqc.com').replace(/\/$/, '')}/brand/email-logo.png`,
  /** Where "Support" questions go; mirrored from the in-app Support link. */
  supportEmail: process.env.SUPPORT_EMAIL ?? 'timvancau@gmail.com',
} as const;

export interface EmailMessage {
  subject: string;
  html: string;
  text: string;
}

export interface LinkEmailInput {
  /** First name or full name as stored in the app. */
  name: string;
  /** The link the person must open; comes from Neon Auth. */
  link: string;
  /** When the link stops working. */
  expiresAt: Date | null;
  /** Where the app lives, for the footer. */
  appUrl: string;
  /** Injectable for tests. */
  now?: Date;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function firstName(name: string): string {
  const first = name.trim().split(/\s+/)[0];
  return first || 'there';
}

/** "1 hour", "45 minutes", or null when unknown. Rounded so it reads naturally. */
export function expiryPhrase(expiresAt: Date | null, now: Date = new Date()): string | null {
  if (!expiresAt) return null;
  const minutes = Math.round((expiresAt.getTime() - now.getTime()) / 60_000);
  if (minutes <= 0) return null;
  if (minutes < 55) return `${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  return hours === 1 ? '1 hour' : `${hours} hours`;
}

interface LayoutInput {
  heading: string;
  /** Paragraphs shown above the button, already plain text (escaped here). */
  intro: string[];
  buttonLabel: string;
  link: string;
  /** Paragraphs shown below the button. */
  outro: string[];
  appUrl: string;
}

function layout(input: LayoutInput): { html: string; text: string } {
  const header = BRAND.logoUrl
    ? `<img src="${escapeHtml(BRAND.logoUrl)}" alt="${escapeHtml(BRAND.company)}" width="200" height="64" style="width:200px;height:auto;display:block;border:0;">`
    : `<span style="font-size:18px;font-weight:700;color:#111111;letter-spacing:-0.01em;">${escapeHtml(BRAND.appName)}</span>`;

  const paragraphs = (ps: string[]) =>
    ps
      .map(
        (p) =>
          `<p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#1f2937;">${escapeHtml(p)}</p>`,
      )
      .join('');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(input.heading)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f6;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;">
<tr><td style="padding:28px 32px 0;">${header}</td></tr>
<tr><td style="padding:24px 32px 0;">
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;font-weight:700;color:#111111;">${escapeHtml(input.heading)}</h1>
${paragraphs(input.intro)}
<table role="presentation" cellspacing="0" cellpadding="0" style="margin:8px 0 24px;">
<tr><td style="border-radius:8px;background:#111111;">
<a href="${escapeHtml(input.link)}" style="display:inline-block;padding:13px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(input.buttonLabel)}</a>
</td></tr>
</table>
${paragraphs(input.outro)}
<p style="margin:0 0 16px;font-size:13px;line-height:1.5;color:#6b7280;">If the button does not work, copy and paste this link into your browser:<br><a href="${escapeHtml(input.link)}" style="color:#374151;word-break:break-all;">${escapeHtml(input.link)}</a></p>
<p style="margin:24px 0 0;font-size:15px;line-height:1.55;color:#1f2937;">Best regards,<br><strong>${escapeHtml(BRAND.signoff)}</strong></p>
</td></tr>
<tr><td style="padding:24px 32px 28px;">
<p style="margin:0;font-size:12px;line-height:1.5;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:16px;">${escapeHtml(BRAND.appName)} · <a href="${escapeHtml(input.appUrl)}" style="color:#9ca3af;">${escapeHtml(input.appUrl.replace(/^https?:\/\//, ''))}</a><br>Questions? Email <a href="mailto:${escapeHtml(BRAND.supportEmail)}" style="color:#9ca3af;">${escapeHtml(BRAND.supportEmail)}</a>.</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    input.heading,
    '',
    ...input.intro,
    '',
    `${input.buttonLabel}: ${input.link}`,
    '',
    ...input.outro,
    '',
    'Best regards,',
    BRAND.signoff,
    '',
    `${BRAND.appName} · ${input.appUrl}`,
    `Questions? Email ${BRAND.supportEmail}.`,
  ].join('\n');

  return { html, text };
}

/** Sent when an admin invites someone and asks the app to email them a set-password link. */
export function accountSetupEmail(input: LinkEmailInput): EmailMessage {
  const expiry = expiryPhrase(input.expiresAt, input.now);
  const body = layout({
    heading: `Welcome to the ${BRAND.appName}`,
    intro: [
      `Hi ${firstName(input.name)},`,
      `An account has been created for you on the ${BRAND.appName}, the app the call team uses for the nightly QA/QC calls. Choose a password to finish setting it up.`,
    ],
    buttonLabel: 'Set your password',
    link: input.link,
    outro: [
      expiry
        ? `This link works for ${expiry}. If it has expired, open the app, choose "Forgot password" and we will send you a new one.`
        : 'If the link has expired, open the app, choose "Forgot password" and we will send you a new one.',
      'After that you can sign in any time with your email address and the password you chose.',
    ],
    appUrl: input.appUrl,
  });
  return { subject: `Set up your ${BRAND.appName} account`, ...body };
}

/** Sent when an existing user (or an admin on their behalf) asks for a password reset. */
export function passwordResetEmail(input: LinkEmailInput): EmailMessage {
  const expiry = expiryPhrase(input.expiresAt, input.now);
  const body = layout({
    heading: 'Reset your password',
    intro: [
      `Hi ${firstName(input.name)},`,
      `We received a request to reset the password for your ${BRAND.appName} account. Choose a new one with the button below.`,
    ],
    buttonLabel: 'Reset password',
    link: input.link,
    outro: [
      expiry ? `This link works for ${expiry}.` : 'This link expires soon.',
      `If you did not ask for this, you can ignore this email. Your password stays the same. If you are concerned, email ${BRAND.supportEmail}.`,
    ],
    appUrl: input.appUrl,
  });
  return { subject: `Reset your ${BRAND.appName} password`, ...body };
}
