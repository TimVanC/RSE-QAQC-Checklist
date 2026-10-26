/**
 * Decides which branded email a Neon Auth link event should become, and sends it.
 *
 * Neon fires `send.magic_link` with link_type "forget-password" for both of our flows (an invite
 * that emails a set-password link, and a real password reset). The app tells them apart by whether
 * the person has ever signed in.
 */
import 'server-only';
import { and, eq, isNull } from 'drizzle-orm';
import { getDb } from '@/src/db';
import { appUsers } from '@/src/db/schema/users';
import type { MagicLinkEventData, NeonWebhookEvent } from '@/src/lib/auth/neon-webhook';
import { sendEmail, type SendEmailResult } from './resend';
import { accountSetupEmail, passwordResetEmail, type EmailMessage } from './templates';

export type AuthEmailKind = 'account_setup' | 'password_reset';

export function chooseAuthEmail(input: {
  kind: AuthEmailKind;
  name: string;
  link: string;
  expiresAt: Date | null;
  appUrl: string;
}): EmailMessage {
  return input.kind === 'account_setup' ? accountSetupEmail(input) : passwordResetEmail(input);
}

export interface HandleResult {
  handled: boolean;
  kind?: AuthEmailKind;
  to?: string;
  result?: SendEmailResult;
  skipped?: string;
}

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'https://rseqaqc.com').replace(/\/$/, '');
}

/** Sends the branded email for a `send.magic_link` event. Never throws; the route maps the result. */
export async function handleMagicLinkEvent(
  event: NeonWebhookEvent<MagicLinkEventData>,
): Promise<HandleResult> {
  const data = event.event_data;
  const email = (event.user?.email ?? '').trim().toLowerCase();
  if (!email || !data?.link_url) return { handled: false, skipped: 'no recipient or link' };
  if (data.link_type !== 'forget-password')
    return { handled: false, skipped: `link_type ${data.link_type}` };

  const db = getDb();
  const [row] = await db
    .select({ name: appUsers.name, lastLoginAt: appUsers.lastLoginAt, active: appUsers.active })
    .from(appUsers)
    .where(and(eq(appUsers.email, email), isNull(appUsers.deletedAt)))
    .limit(1);
  // Unknown or deactivated people get nothing: the app is invite-only, and Better Auth would
  // otherwise happily email anyone with a stray account.
  if (!row || !row.active) return { handled: false, skipped: 'not an active app user' };

  const kind: AuthEmailKind = row.lastLoginAt ? 'password_reset' : 'account_setup';
  const expiresAt = data.expires_at ? new Date(data.expires_at) : null;
  const message = chooseAuthEmail({
    kind,
    name: row.name || event.user?.name || email,
    link: data.link_url,
    expiresAt: expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt : null,
    appUrl: appUrl(),
  });
  const result = await sendEmail({ to: email, ...message });
  return { handled: true, kind, to: email, result };
}
