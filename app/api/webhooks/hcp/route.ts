import { after, NextResponse } from 'next/server';
import { getSyncDeps, hcpConfigured } from '@/src/lib/hcp/deps';
import { processWebhookEvent, storeWebhookEvent } from '@/src/lib/hcp/webhook-processor';
import { HCP_SIGNATURE_HEADER, HCP_TIMESTAMP_HEADER, isVerificationProbe, verifyHcpSignature } from '@/src/lib/hcp/webhooks';
import type { HcpWebhookPayload } from '@/src/lib/hcp/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Housecall Pro webhook receiver. Verifies the HMAC signature, stores the event (deduplicated),
 * responds immediately, then re-fetches the entity from the API after the response is sent.
 * Unprocessed events are retried by the reconcile cron.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();

  // Housecall Pro verifies a new webhook URL by POSTing {"foo":"bar"} before it issues the signing
  // secret, so that probe (and only that probe) is accepted unsigned. It carries no data to act on.
  if (isVerificationProbe(rawBody)) {
    return NextResponse.json({ ok: true, probe: true });
  }

  const secret = process.env.HCP_WEBHOOK_SECRET;
  if (!secret || !hcpConfigured()) {
    return NextResponse.json({ error: 'webhooks not configured' }, { status: 503 });
  }
  const verdict = verifyHcpSignature({
    rawBody,
    timestamp: request.headers.get(HCP_TIMESTAMP_HEADER),
    signature: request.headers.get(HCP_SIGNATURE_HEADER),
    secret,
  });
  if (!verdict.ok) {
    return NextResponse.json({ error: 'invalid signature', reason: verdict.reason }, { status: 401 });
  }

  let payload: HcpWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as HcpWebhookPayload;
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const deps = getSyncDeps();
  const stored = await storeWebhookEvent(deps.db, payload);
  if (!stored.event) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  // New event, or a re-delivery of one we have not finished processing: process after responding.
  const event = stored.event;
  after(async () => {
    await processWebhookEvent(deps, event);
  });

  return NextResponse.json({ ok: true, id: event.id, event: event.event, duplicate: !stored.isNew });
}
