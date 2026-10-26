/**
 * Minimal Resend sender over its HTTP API (no SDK). Server only; the key never reaches the browser.
 *
 * Env: RESEND_API_KEY (required to send), EMAIL_FROM (default below, must be on a domain verified
 * in Resend, i.e. rseqaqc.com).
 */
import 'server-only';
import type { EmailMessage } from './templates';

export const DEFAULT_FROM = 'RSE QA/QC Checklist <no-reply@rseqaqc.com>';

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export interface SendEmailInput extends EmailMessage {
  to: string;
  /** Overrides the default sender, e.g. in tests. */
  from?: string;
  /** Injectable fetch for tests. */
  fetchImpl?: typeof fetch;
}

export type SendEmailResult = { ok: true; id: string | null } | { ok: false; error: string };

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: 'RESEND_API_KEY is not set' };
  const from = input.from ?? process.env.EMAIL_FROM ?? DEFAULT_FROM;
  const doFetch = input.fetchImpl ?? fetch;
  try {
    const res = await doFetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, error: `Resend ${res.status}: ${body.slice(0, 300)}` };
    }
    const json = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, id: json.id ?? null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
