import { describe, expect, it, vi } from 'vitest';
import { HcpApiError, HcpClient, buildQuery, retryAfterSeconds } from '@/src/lib/hcp/client';

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

function makeClient(responses: Array<Response | Error>, overrides: Partial<ConstructorParameters<typeof HcpClient>[0]> = {}) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = responses.shift();
    if (!next) throw new Error('no more mocked responses');
    if (next instanceof Error) throw next;
    return next;
  });
  const sleeps: number[] = [];
  const client = new HcpClient({
    apiKey: 'test-key',
    fetch: fetchMock as unknown as typeof fetch,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    baseDelayMs: 10,
    maxDelayMs: 1000,
    now: () => 1_760_000_000_000,
    logger: { warn: () => {}, info: () => {} },
    ...overrides,
  });
  return { client, calls, sleeps, fetchMock };
}

describe('buildQuery', () => {
  it('encodes scalars and arrays with [] suffix, skipping empty values', () => {
    expect(
      buildQuery({ page: 2, expand: ['appointments'], work_status: ['scheduled', 'in_progress'], q: undefined, x: null }),
    ).toBe('?page=2&expand%5B%5D=appointments&work_status%5B%5D=scheduled&work_status%5B%5D=in_progress');
    expect(buildQuery({})).toBe('');
  });
});

describe('retryAfterSeconds', () => {
  const now = 1_760_000_000_000;
  it('reads RateLimit-Reset as epoch seconds', () => {
    const h = new Headers({ 'RateLimit-Reset': String(now / 1000 + 7) });
    expect(retryAfterSeconds(h, now)).toBeCloseTo(7, 6);
  });
  it('reads Retry-After seconds', () => {
    expect(retryAfterSeconds(new Headers({ 'Retry-After': '3' }), now)).toBe(3);
  });
  it('returns null without hints', () => {
    expect(retryAfterSeconds(new Headers(), now)).toBeNull();
  });
});

describe('HcpClient.get', () => {
  it('sends the Token auth header and Accept header', async () => {
    const { client, calls } = makeClient([jsonResponse({ ok: 1 })]);
    await client.get('/company');
    expect(calls[0].url).toBe('https://api.housecallpro.com/company');
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Token test-key');
    expect(headers.Accept).toBe('application/json');
  });

  it('retries on 429 honouring RateLimit-Reset, then succeeds', async () => {
    const { client, sleeps, fetchMock } = makeClient([
      new Response('rate limited', { status: 429, headers: { 'RateLimit-Reset': String(1_760_000_000 + 2) } }),
      jsonResponse({ jobs: [] }),
    ]);
    const data = await client.get<{ jobs: unknown[] }>('/jobs');
    expect(data.jobs).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleeps[0]).toBeGreaterThanOrEqual(2000);
  });

  it('retries on 5xx and network errors with backoff', async () => {
    const { client, sleeps, fetchMock } = makeClient([
      new Response('boom', { status: 503 }),
      new TypeError('fetch failed'),
      jsonResponse({ ok: true }),
    ]);
    await client.get('/employees');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sleeps.length).toBe(2);
    expect(sleeps[1]).toBeGreaterThanOrEqual(sleeps[0]);
  });

  it('does not retry 4xx other than 429', async () => {
    const { client, fetchMock } = makeClient([new Response('nope', { status: 404 })]);
    await expect(client.get('/jobs/missing')).rejects.toBeInstanceOf(HcpApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('gives up after maxAttempts', async () => {
    const { client, fetchMock } = makeClient(
      [new Response('x', { status: 500 }), new Response('x', { status: 500 }), new Response('x', { status: 500 })],
      { maxAttempts: 3 },
    );
    await expect(client.get('/jobs')).rejects.toMatchObject({ status: 500 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe('HcpClient.paginate', () => {
  it('walks all pages using total_pages and the named array', async () => {
    const { client, calls } = makeClient([
      jsonResponse({ page: 1, page_size: 2, total_pages: 2, total_items: 3, jobs: [{ id: 'a' }, { id: 'b' }] }),
      jsonResponse({ page: 2, page_size: 2, total_pages: 2, total_items: 3, jobs: [{ id: 'c' }] }),
    ]);
    const items = await client.listAll<{ id: string }>('/jobs', 'jobs', { page_size: 2 });
    expect(items.map((i) => i.id)).toEqual(['a', 'b', 'c']);
    expect(calls[0].url).toContain('page=1');
    expect(calls[1].url).toContain('page=2');
  });

  it('stops on an empty page even if total_pages says otherwise', async () => {
    const { client, fetchMock } = makeClient([
      jsonResponse({ page: 1, total_pages: 5, jobs: [] }),
    ]);
    const items = await client.listAll('/jobs', 'jobs');
    expect(items).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
