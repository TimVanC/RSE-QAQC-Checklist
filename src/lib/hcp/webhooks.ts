/**
 * Housecall Pro webhook signature verification.
 *
 * Documented scheme: headers `Api-Timestamp` (epoch seconds) and `Api-Signature`;
 * signature = HMAC_SHA256(secret, `${timestamp}.${raw_body}`). The digest encoding is not
 * documented, so hex and base64 are both accepted, compared in constant time.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export const HCP_TIMESTAMP_HEADER = 'api-timestamp';
export const HCP_SIGNATURE_HEADER = 'api-signature';

export interface VerifyOptions {
  rawBody: string;
  timestamp: string | null | undefined;
  signature: string | null | undefined;
  secret: string;
  /** Current time in ms; injectable for tests. */
  nowMs?: number;
  /** Max age of the timestamp in seconds. */
  toleranceSeconds?: number;
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: 'missing_headers' | 'bad_timestamp' | 'stale' | 'bad_signature' };

export function computeHcpSignature(secret: string, timestamp: string, rawBody: string) {
  const hmac = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest();
  return { hex: hmac.toString('hex'), base64: hmac.toString('base64'), raw: hmac };
}

function safeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyHcpSignature(opts: VerifyOptions): VerifyResult {
  const { rawBody, timestamp, signature, secret } = opts;
  const nowMs = opts.nowMs ?? Date.now();
  const tolerance = opts.toleranceSeconds ?? 300;

  if (!timestamp || !signature) return { ok: false, reason: 'missing_headers' };
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: 'bad_timestamp' };
  if (Math.abs(nowMs / 1000 - ts) > tolerance) return { ok: false, reason: 'stale' };

  const expected = computeHcpSignature(secret, timestamp, rawBody).raw;
  const provided = signature.trim();

  const candidates: Buffer[] = [];
  if (/^[0-9a-f]+$/i.test(provided) && provided.length === expected.length * 2) {
    candidates.push(Buffer.from(provided, 'hex'));
  }
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(provided)) {
    candidates.push(Buffer.from(provided, 'base64'));
  }
  // Some providers prefix the scheme, e.g. "sha256=<hex>".
  const m = /^sha256=(.+)$/i.exec(provided);
  if (m) {
    const v = m[1];
    if (/^[0-9a-f]+$/i.test(v)) candidates.push(Buffer.from(v, 'hex'));
    else candidates.push(Buffer.from(v, 'base64'));
  }

  for (const c of candidates) {
    if (safeEqual(c, expected)) return { ok: true };
  }
  return { ok: false, reason: 'bad_signature' };
}

/** Stable key used to drop duplicate deliveries of the same event. */
export function webhookDedupeKey(event: string, entityId: string | undefined, occurredAt: string | undefined) {
  return `${event}:${entityId ?? '-'}:${occurredAt ?? '-'}`;
}
