import { NextResponse } from 'next/server';
import {
  createJwksResolver,
  NEON_EVENT_ID_HEADER,
  NEON_EVENT_TYPE_HEADER,
  NEON_KID_HEADER,
  NEON_SIGNATURE_HEADER,
  NEON_TIMESTAMP_HEADER,
  verifyNeonSignature,
  type MagicLinkEventData,
  type NeonWebhookEvent,
} from '@/src/lib/auth/neon-webhook';
import { handleMagicLinkEvent } from '@/src/lib/email/auth-emails';
import { emailConfigured } from '@/src/lib/email/resend';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

let resolver: ReturnType<typeof createJwksResolver> | null = null;
function getKey(kid: string) {
  if (!resolver) {
    const base = (process.env.NEON_AUTH_BASE_URL ?? '').replace(/\/$/, '');
    resolver = createJwksResolver(`${base}/.well-known/jwks.json`);
  }
  return resolver(kid);
}

/**
 * Neon Auth webhook receiver. When the `send.magic_link` event is subscribed, Neon stops sending
 * its own email and waits (blocking, up to 10 s) for this endpoint instead. We verify the Ed25519
 * signature, pick the branded template, send through Resend and answer 2xx. A 5xx makes Neon retry
 * (3 attempts); after that the person sees an error, so sending failures are returned as 502.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const verdict = await verifyNeonSignature({
    rawBody,
    signature: request.headers.get(NEON_SIGNATURE_HEADER),
    kid: request.headers.get(NEON_KID_HEADER),
    timestamp: request.headers.get(NEON_TIMESTAMP_HEADER),
    getKey,
  });
  if (!verdict.ok) {
    return NextResponse.json(
      { error: 'invalid signature', reason: verdict.reason },
      { status: 401 },
    );
  }

  let event: NeonWebhookEvent;
  try {
    event = JSON.parse(rawBody) as NeonWebhookEvent;
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  const eventType = event.event_type ?? request.headers.get(NEON_EVENT_TYPE_HEADER) ?? '';
  const eventId = event.event_id ?? request.headers.get(NEON_EVENT_ID_HEADER) ?? null;

  if (eventType !== 'send.magic_link') {
    // Not something we deliver; acknowledge so Neon does not retry.
    return NextResponse.json({ ok: true, ignored: eventType, id: eventId });
  }
  if (!emailConfigured()) {
    console.error('[neon-auth webhook] RESEND_API_KEY missing; cannot deliver', eventId);
    return NextResponse.json({ error: 'email not configured' }, { status: 503 });
  }

  const outcome = await handleMagicLinkEvent(
    event as unknown as NeonWebhookEvent<MagicLinkEventData>,
  );
  if (outcome.handled && outcome.result && !outcome.result.ok) {
    console.error('[neon-auth webhook] send failed', eventId, outcome.result.error);
    return NextResponse.json({ error: 'send failed' }, { status: 502 });
  }
  return NextResponse.json({
    ok: true,
    id: eventId,
    kind: outcome.kind ?? null,
    skipped: outcome.skipped ?? null,
  });
}
