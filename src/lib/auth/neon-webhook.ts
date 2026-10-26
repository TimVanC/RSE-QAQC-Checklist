/**
 * Neon Auth webhook signature verification and payload types.
 *
 * Neon signs every delivery with a detached JWS (EdDSA / Ed25519):
 *   X-Neon-Signature:     "<protectedHeaderB64>..<signatureB64>"
 *   X-Neon-Signature-Kid: key id, looked up in <NEON_AUTH_BASE_URL>/.well-known/jwks.json
 *   X-Neon-Timestamp:     unix time in milliseconds
 * Signing input = protectedHeaderB64 + "." + base64url(timestamp + "." + base64url(rawBody)).
 *
 * Pure apart from the JWKS fetch, which is injectable (and cached) so tests can sign with a
 * throwaway key.
 */
import { createPublicKey, verify as cryptoVerify, type KeyObject } from 'node:crypto';

export const NEON_SIGNATURE_HEADER = 'x-neon-signature';
export const NEON_KID_HEADER = 'x-neon-signature-kid';
export const NEON_TIMESTAMP_HEADER = 'x-neon-timestamp';
export const NEON_EVENT_ID_HEADER = 'x-neon-event-id';
export const NEON_EVENT_TYPE_HEADER = 'x-neon-event-type';

export interface Jwk {
  kid?: string;
  kty: string;
  crv?: string;
  x?: string;
  [k: string]: unknown;
}

export interface NeonWebhookEvent<T = Record<string, unknown>> {
  event_id: string;
  event_type: string;
  timestamp: string;
  context?: { endpoint_id?: string; project_name?: string };
  user?: { id?: string; email?: string; name?: string | null; [k: string]: unknown };
  event_data: T;
}

export interface MagicLinkEventData {
  link_type: 'sign-in' | 'email-verification' | 'forget-password';
  link_url: string;
  token?: string;
  expires_at?: string;
  ip_address?: string | null;
  user_agent?: string | null;
}

export type VerifyNeonResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'missing_headers'
        | 'bad_timestamp'
        | 'stale'
        | 'bad_signature_format'
        | 'unknown_kid'
        | 'bad_signature';
    };

export interface VerifyNeonOptions {
  rawBody: string;
  signature: string | null | undefined;
  kid: string | null | undefined;
  timestamp: string | null | undefined;
  /** Resolves a key id to a JWK; null when unknown. */
  getKey: (kid: string) => Promise<Jwk | null> | Jwk | null;
  nowMs?: number;
  toleranceMs?: number;
}

export function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url');
}

/** Exactly what Neon signs, exported so tests can produce a valid signature. */
export function neonSigningInput(
  protectedHeaderB64: string,
  timestamp: string,
  rawBody: string,
): string {
  return `${protectedHeaderB64}.${base64url(`${timestamp}.${base64url(rawBody)}`)}`;
}

export function jwkToKeyObject(jwk: Jwk): KeyObject {
  return createPublicKey({ key: jwk as never, format: 'jwk' });
}

export async function verifyNeonSignature(opts: VerifyNeonOptions): Promise<VerifyNeonResult> {
  const { rawBody, signature, kid, timestamp } = opts;
  if (!signature || !kid || !timestamp) return { ok: false, reason: 'missing_headers' };

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: 'bad_timestamp' };
  const nowMs = opts.nowMs ?? Date.now();
  const tolerance = opts.toleranceMs ?? 5 * 60_000;
  if (Math.abs(nowMs - ts) > tolerance) return { ok: false, reason: 'stale' };

  const parts = signature.split('.');
  if (parts.length !== 3 || parts[1] !== '' || !parts[0] || !parts[2]) {
    return { ok: false, reason: 'bad_signature_format' };
  }
  const [headerB64, , sigB64] = parts;

  const jwk = await opts.getKey(kid);
  if (!jwk) return { ok: false, reason: 'unknown_kid' };

  try {
    const key = jwkToKeyObject(jwk);
    const input = Buffer.from(neonSigningInput(headerB64, timestamp, rawBody));
    const ok = cryptoVerify(null, input, key, Buffer.from(sigB64, 'base64url'));
    return ok ? { ok: true } : { ok: false, reason: 'bad_signature' };
  } catch {
    return { ok: false, reason: 'bad_signature' };
  }
}

/** JWKS loader with a small in-memory cache; refetches once when a kid is not found (key rotation). */
export function createJwksResolver(
  jwksUrl: string,
  fetchImpl: typeof fetch = fetch,
  ttlMs = 10 * 60_000,
) {
  let keys: Jwk[] = [];
  let fetchedAt = 0;

  async function load(): Promise<void> {
    const res = await fetchImpl(jwksUrl, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
    const json = (await res.json()) as { keys?: Jwk[] };
    keys = Array.isArray(json.keys) ? json.keys : [];
    fetchedAt = Date.now();
  }

  return async function getKey(kid: string): Promise<Jwk | null> {
    if (Date.now() - fetchedAt > ttlMs) await load();
    let hit = keys.find((k) => k.kid === kid);
    if (!hit) {
      await load();
      hit = keys.find((k) => k.kid === kid);
    }
    return hit ?? null;
  };
}
