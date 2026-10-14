/**
 * Read-only Housecall Pro API client. Server-side only: it reads HCP_API_KEY from the environment
 * and must never be imported from a client component.
 *
 * Behaviour (see docs/reference/housecall-pro-api.md):
 * - `Authorization: Token <key>`, `Accept: application/json`
 * - Page-number pagination (`page`, `page_size`)
 * - Retries 429 / 5xx / network errors with exponential backoff and jitter, honouring
 *   `RateLimit-Reset` (epoch seconds) and `Retry-After` when present
 * - Logs only ids and counts, never customer data
 */
import type {
  HcpAppointment,
  HcpCompany,
  HcpCustomer,
  HcpEmployee,
  HcpInvoice,
  HcpJob,
  HcpJobsQuery,
} from './types';

export const HCP_BASE_URL = 'https://api.housecallpro.com';

export class HcpApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly path: string,
    readonly body?: string,
  ) {
    super(message);
    this.name = 'HcpApiError';
  }
}

export type QueryValue = string | number | boolean | undefined | null | Array<string | number>;
export type Query = Record<string, QueryValue>;

export interface HcpClientOptions {
  apiKey?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  /** Max attempts per request, including the first. */
  maxAttempts?: number;
  /** Base delay for backoff in ms. */
  baseDelayMs?: number;
  /** Cap for a single backoff wait in ms. */
  maxDelayMs?: number;
  /** Per-request timeout in ms. */
  timeoutMs?: number;
  /** Default page size for list calls. */
  pageSize?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  logger?: Pick<Console, 'warn' | 'info'>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function buildQuery(query: Query = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const v of value) params.append(`${key}[]`, String(v));
    } else {
      params.append(key, String(value));
    }
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

/** Seconds to wait as instructed by the server, or null when no usable header is present. */
export function retryAfterSeconds(headers: Headers, nowMs: number): number | null {
  const reset = headers.get('RateLimit-Reset') ?? headers.get('ratelimit-reset');
  if (reset) {
    const n = Number(reset);
    if (Number.isFinite(n)) {
      // Epoch seconds (HCP) or a delta in seconds; treat anything that looks like an epoch as such.
      const seconds = n > 1_000_000_000 ? n - nowMs / 1000 : n;
      return Math.max(0, seconds);
    }
  }
  const retryAfter = headers.get('Retry-After');
  if (retryAfter) {
    const n = Number(retryAfter);
    if (Number.isFinite(n)) return Math.max(0, n);
    const date = Date.parse(retryAfter);
    if (!Number.isNaN(date)) return Math.max(0, (date - nowMs) / 1000);
  }
  return null;
}

export class HcpClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly maxAttempts: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly timeoutMs: number;
  readonly pageSize: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly logger: Pick<Console, 'warn' | 'info'>;

  constructor(options: HcpClientOptions = {}) {
    const apiKey = options.apiKey ?? process.env.HCP_API_KEY;
    if (!apiKey) throw new Error('HCP_API_KEY is not set');
    this.apiKey = apiKey;
    this.baseUrl = options.baseUrl ?? HCP_BASE_URL;
    this.fetchImpl = options.fetch ?? fetch;
    this.maxAttempts = options.maxAttempts ?? 5;
    this.baseDelayMs = options.baseDelayMs ?? 1000;
    this.maxDelayMs = options.maxDelayMs ?? 30_000;
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.pageSize = options.pageSize ?? 50;
    this.sleep = options.sleep ?? defaultSleep;
    this.now = options.now ?? Date.now;
    this.logger = options.logger ?? console;
  }

  /** GET a JSON resource with retries. `path` starts with `/`. */
  async get<T>(path: string, query: Query = {}): Promise<T> {
    const url = `${this.baseUrl}${path}${buildQuery(query)}`;
    let attempt = 0;
    for (;;) {
      attempt += 1;
      let response: Response;
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
          response = await this.fetchImpl(url, {
            method: 'GET',
            headers: {
              Authorization: `Token ${this.apiKey}`,
              Accept: 'application/json',
            },
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timer);
        }
      } catch (err) {
        if (attempt >= this.maxAttempts) {
          throw new HcpApiError(`network error after ${attempt} attempts: ${String(err)}`, 0, path);
        }
        await this.backoff(attempt, null, path, 'network');
        continue;
      }

      if (response.ok) {
        return (await response.json()) as T;
      }

      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt >= this.maxAttempts) {
        const body = await safeText(response);
        throw new HcpApiError(`HCP ${response.status} on ${path}`, response.status, path, body);
      }
      const hinted = retryAfterSeconds(response.headers, this.now());
      await this.backoff(attempt, hinted, path, String(response.status));
    }
  }

  private async backoff(attempt: number, hintedSeconds: number | null, path: string, reason: string) {
    const exp = Math.min(this.maxDelayMs, this.baseDelayMs * 2 ** (attempt - 1));
    const jitter = Math.random() * 0.25 * exp;
    const wait = hintedSeconds != null ? Math.max(exp, hintedSeconds * 1000) : exp + jitter;
    this.logger.warn(`[hcp] retry ${attempt}/${this.maxAttempts} on ${path} (${reason}) in ${Math.round(wait)}ms`);
    await this.sleep(Math.min(wait, this.maxDelayMs * 2));
  }

  /** Iterate every item of a paginated list endpoint. `key` is the array property name. */
  async *paginate<T>(path: string, key: string, query: Query = {}): AsyncGenerator<T, void, void> {
    let page = 1;
    for (;;) {
      const data = await this.get<Record<string, unknown>>(path, {
        ...query,
        page,
        page_size: query.page_size ?? this.pageSize,
      });
      const items = (data[key] as T[] | undefined) ?? [];
      for (const item of items) yield item;
      const totalPages = Number(data.total_pages ?? 1);
      if (items.length === 0 || page >= totalPages) return;
      page += 1;
    }
  }

  async listAll<T>(path: string, key: string, query: Query = {}): Promise<T[]> {
    const out: T[] = [];
    for await (const item of this.paginate<T>(path, key, query)) out.push(item);
    return out;
  }

  // ---- typed endpoints -------------------------------------------------------------------

  company(): Promise<HcpCompany> {
    return this.get<HcpCompany>('/company');
  }

  employees(): Promise<HcpEmployee[]> {
    return this.listAll<HcpEmployee>('/employees', 'employees');
  }

  jobs(query: HcpJobsQuery = {}): AsyncGenerator<HcpJob, void, void> {
    return this.paginate<HcpJob>('/jobs', 'jobs', query as Query);
  }

  job(id: string, expand: Array<'appointments' | 'attachments'> = ['appointments']): Promise<HcpJob> {
    return this.get<HcpJob>(`/jobs/${encodeURIComponent(id)}`, { expand });
  }

  async jobAppointments(jobId: string): Promise<HcpAppointment[]> {
    const data = await this.get<{ appointments?: HcpAppointment[] }>(
      `/jobs/${encodeURIComponent(jobId)}/appointments`,
    );
    return data.appointments ?? [];
  }

  async jobInvoices(jobId: string): Promise<HcpInvoice[]> {
    const data = await this.get<{ invoices?: HcpInvoice[] }>(`/jobs/${encodeURIComponent(jobId)}/invoices`);
    return data.invoices ?? [];
  }

  customer(id: string): Promise<HcpCustomer> {
    return this.get<HcpCustomer>(`/customers/${encodeURIComponent(id)}`);
  }

  async jobTypes(): Promise<Array<{ id: string; name: string }>> {
    return this.listAll<{ id: string; name: string }>('/job_fields/job_types', 'job_types');
  }

  async tags(): Promise<Array<{ id: string; name: string }>> {
    return this.listAll<{ id: string; name: string }>('/tags', 'tags');
  }
}

async function safeText(response: Response): Promise<string | undefined> {
  try {
    const text = await response.text();
    return text.slice(0, 500);
  } catch {
    return undefined;
  }
}

let singleton: HcpClient | null = null;

/** Process-wide client for server code. Throws if HCP_API_KEY is missing. */
export function getHcpClient(): HcpClient {
  if (!singleton) singleton = new HcpClient();
  return singleton;
}
