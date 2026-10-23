import { describe, expect, it } from 'vitest';
import { computeHcpSignature, isVerificationProbe, verifyHcpSignature, webhookDedupeKey } from '@/src/lib/hcp/webhooks';

describe('isVerificationProbe', () => {
  it('accepts only the exact {"foo":"bar"} body', () => {
    expect(isVerificationProbe('{"foo":"bar"}')).toBe(true);
    expect(isVerificationProbe('{"foo": "bar"}')).toBe(true);
    expect(isVerificationProbe('{"foo":"bar","event":"job.updated"}')).toBe(false);
    expect(isVerificationProbe('{"event":"job.updated","job":{"id":"j"}}')).toBe(false);
    expect(isVerificationProbe('{"foo":"baz"}')).toBe(false);
    expect(isVerificationProbe('["foo"]')).toBe(false);
    expect(isVerificationProbe('not json')).toBe(false);
    expect(isVerificationProbe('')).toBe(false);
  });
});

const secret = 'whsec_test_secret_value';
const body = JSON.stringify({ company_id: 'c1', event: 'job.updated', job: { id: 'job_1' } });
const now = 1_760_000_000_000; // ms
const ts = String(Math.floor(now / 1000));

describe('verifyHcpSignature', () => {
  it('accepts a hex digest', () => {
    const { hex } = computeHcpSignature(secret, ts, body);
    expect(verifyHcpSignature({ rawBody: body, timestamp: ts, signature: hex, secret, nowMs: now })).toEqual({
      ok: true,
    });
  });

  it('accepts a base64 digest', () => {
    const { base64 } = computeHcpSignature(secret, ts, body);
    expect(
      verifyHcpSignature({ rawBody: body, timestamp: ts, signature: base64, secret, nowMs: now }),
    ).toEqual({ ok: true });
  });

  it('accepts a sha256= prefixed hex digest', () => {
    const { hex } = computeHcpSignature(secret, ts, body);
    expect(
      verifyHcpSignature({ rawBody: body, timestamp: ts, signature: `sha256=${hex}`, secret, nowMs: now }),
    ).toEqual({ ok: true });
  });

  it('rejects a tampered body', () => {
    const { hex } = computeHcpSignature(secret, ts, body);
    const r = verifyHcpSignature({ rawBody: body + ' ', timestamp: ts, signature: hex, secret, nowMs: now });
    expect(r).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('rejects a wrong secret', () => {
    const { hex } = computeHcpSignature('other', ts, body);
    expect(verifyHcpSignature({ rawBody: body, timestamp: ts, signature: hex, secret, nowMs: now })).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
  });

  it('rejects stale timestamps beyond the tolerance', () => {
    const old = String(Math.floor(now / 1000) - 600);
    const { hex } = computeHcpSignature(secret, old, body);
    expect(verifyHcpSignature({ rawBody: body, timestamp: old, signature: hex, secret, nowMs: now })).toEqual({
      ok: false,
      reason: 'stale',
    });
  });

  it('rejects missing or malformed headers', () => {
    expect(verifyHcpSignature({ rawBody: body, timestamp: null, signature: 'x', secret, nowMs: now })).toEqual({
      ok: false,
      reason: 'missing_headers',
    });
    expect(verifyHcpSignature({ rawBody: body, timestamp: 'abc', signature: 'x', secret, nowMs: now })).toEqual({
      ok: false,
      reason: 'bad_timestamp',
    });
  });
});

describe('webhookDedupeKey', () => {
  it('is stable for the same event and tolerant of missing parts', () => {
    expect(webhookDedupeKey('job.updated', 'j1', '2026-10-13T00:00:00Z')).toBe(
      'job.updated:j1:2026-10-13T00:00:00Z',
    );
    expect(webhookDedupeKey('job.updated', undefined, undefined)).toBe('job.updated:-:-');
  });
});
