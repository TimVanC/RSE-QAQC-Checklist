import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  base64url,
  neonSigningInput,
  verifyNeonSignature,
  type Jwk,
} from '@/src/lib/auth/neon-webhook';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const jwk = { ...(publicKey.export({ format: 'jwk' }) as Jwk), kid: 'k1' };
const header = base64url(JSON.stringify({ alg: 'EdDSA', typ: 'JWS', kid: 'k1' }));

function signBody(rawBody: string, timestamp: string, key = privateKey, hdr = header) {
  const sig = sign(null, Buffer.from(neonSigningInput(hdr, timestamp, rawBody)), key);
  return `${hdr}..${sig.toString('base64url')}`;
}

const body = JSON.stringify({
  event_id: 'e1',
  event_type: 'send.magic_link',
  event_data: { link_url: 'https://x' },
});
const now = 1_760_000_000_000;
const ts = String(now - 1000);
const getKey = (kid: string) => (kid === 'k1' ? jwk : null);

describe('verifyNeonSignature', () => {
  it('accepts a signature made the way Neon documents', async () => {
    const r = await verifyNeonSignature({
      rawBody: body,
      signature: signBody(body, ts),
      kid: 'k1',
      timestamp: ts,
      getKey,
      nowMs: now,
    });
    expect(r).toEqual({ ok: true });
  });

  it('rejects a tampered body', async () => {
    const r = await verifyNeonSignature({
      rawBody: body.replace('https://x', 'https://evil'),
      signature: signBody(body, ts),
      kid: 'k1',
      timestamp: ts,
      getKey,
      nowMs: now,
    });
    expect(r).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('rejects a signature from another key', async () => {
    const other = generateKeyPairSync('ed25519').privateKey;
    const r = await verifyNeonSignature({
      rawBody: body,
      signature: signBody(body, ts, other),
      kid: 'k1',
      timestamp: ts,
      getKey,
      nowMs: now,
    });
    expect(r).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('rejects unknown key ids, stale timestamps and malformed headers', async () => {
    expect(
      await verifyNeonSignature({
        rawBody: body,
        signature: signBody(body, ts),
        kid: 'nope',
        timestamp: ts,
        getKey,
        nowMs: now,
      }),
    ).toEqual({ ok: false, reason: 'unknown_kid' });
    const old = String(now - 10 * 60_000);
    expect(
      await verifyNeonSignature({
        rawBody: body,
        signature: signBody(body, old),
        kid: 'k1',
        timestamp: old,
        getKey,
        nowMs: now,
      }),
    ).toEqual({ ok: false, reason: 'stale' });
    expect(
      await verifyNeonSignature({
        rawBody: body,
        signature: 'a.b.c',
        kid: 'k1',
        timestamp: ts,
        getKey,
        nowMs: now,
      }),
    ).toEqual({ ok: false, reason: 'bad_signature_format' });
    expect(
      await verifyNeonSignature({
        rawBody: body,
        signature: null,
        kid: 'k1',
        timestamp: ts,
        getKey,
        nowMs: now,
      }),
    ).toEqual({ ok: false, reason: 'missing_headers' });
  });
});
