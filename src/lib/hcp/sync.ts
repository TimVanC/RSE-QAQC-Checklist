/**
 * Housecall Pro -> Postgres sync (read-only against HCP).
 *
 * Entry points:
 *   runReconcile   daily at 01:00 UTC on the Vercel Hobby plan (or every 15 min from an external
 *                  pinger): jobs scheduled in [today-2d, today+7d] NY plus anything updated since
 *                  the last successful reconcile; the cron route then retries pending webhooks
 *   runBackfill    nightly: employees, catalog, jobs in [today-30d, today+30d]
 *   runManualRefresh  one NY day, triggered from the call queue
 *   syncSingleJob  one job by id (webhooks)
 *
 * Every write is an idempotent upsert keyed by the HCP id. Job rows only move forward: an update
 * is applied only when the incoming `updated_at` is not older than the stored one, so a delayed
 * webhook cannot overwrite fresher cron data. Nothing is ever deleted; cancellations and deletions
 * set `canceled_at` / `deleted_at`.
 */
import 'server-only';
import { and, eq, gt, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import type { Db } from '@/src/db';
import {
  hcpAppointments,
  hcpCustomers,
  hcpInvoices,
  hcpJobAssignees,
  hcpJobs,
  hcpPayments,
  technicians,
} from '@/src/db/schema/hcp';
import { appSettings, syncRuns } from '@/src/db/schema/system';
import { addDays, appDayRange, todayAppDate, type IsoDate } from '@/src/lib/time';
import type { HcpClient } from './client';
import { mapAppointment, mapCustomer, mapEmployee, mapInvoice, mapJob, mapPayment, parseHcpTimestamp } from './mappers';
import type { HcpEmployee, HcpInvoice, HcpJob } from './types';

export type HcpReader = Pick<
  HcpClient,
  'employees' | 'jobs' | 'job' | 'jobAppointments' | 'jobInvoices' | 'customer' | 'jobTypes' | 'tags'
>;

export interface SyncDeps {
  db: Db;
  hcp: HcpReader;
  now?: () => Date;
  log?: (message: string, meta?: Record<string, unknown>) => void;
}

export type SyncCounts = Record<string, number>;

function counter(): SyncCounts & { bump: (key: string, n?: number) => void } {
  const counts: SyncCounts = {};
  return Object.assign(counts, {
    bump(key: string, n = 1) {
      counts[key] = (counts[key] ?? 0) + n;
    },
  });
}

function stripCounter(c: SyncCounts): SyncCounts {
  return omit(c, ['bump']);
}

function omit<T extends object, K extends string>(obj: T, keys: readonly K[]): Omit<T, K> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!(keys as readonly string[]).includes(k)) out[k] = v;
  }
  return out as Omit<T, K>;
}

// ---------------------------------------------------------------------------------------------
// Upserts
// ---------------------------------------------------------------------------------------------

export async function upsertEmployees(db: Db, employees: HcpEmployee[], now: Date): Promise<number> {
  let n = 0;
  for (const e of employees) {
    if (!e?.id) continue;
    const row = mapEmployee(e, now);
    // Never overwrite admin-controlled flags (is_technician, active) on an existing row.
    const update = omit(row, ['isTechnician']);
    await db
      .insert(technicians)
      .values(row)
      .onConflictDoUpdate({ target: technicians.hcpEmployeeId, set: update });
    n += 1;
  }
  return n;
}

async function ensureTechnicianIds(db: Db, employees: HcpEmployee[], now: Date): Promise<string[]> {
  const ids: string[] = [];
  const valid = employees.filter((e) => e?.id);
  if (valid.length === 0) return ids;
  // Insert any employee we have not seen (e.g. departed staff still assigned to old jobs).
  for (const e of valid) {
    const row = mapEmployee(e, now);
    await db.insert(technicians).values(row).onConflictDoNothing({ target: technicians.hcpEmployeeId });
  }
  const rows = await db
    .select({ id: technicians.id, hcpEmployeeId: technicians.hcpEmployeeId })
    .from(technicians)
    .where(
      inArray(
        technicians.hcpEmployeeId,
        valid.map((e) => e.id),
      ),
    );
  for (const r of rows) ids.push(r.id);
  return ids;
}

/** Upsert one job with its customer, assignees, appointments, invoices and payments. */
export async function upsertJobBundle(
  db: Db,
  job: HcpJob,
  invoices: HcpInvoice[] | null,
  now: Date,
  counts = counter(),
): Promise<void> {
  if (job.customer?.id) {
    const c = mapCustomer(job.customer, now);
    await db
      .insert(hcpCustomers)
      .values(c)
      .onConflictDoUpdate({
        target: hcpCustomers.hcpCustomerId,
        set: c,
        setWhere: or(isNull(hcpCustomers.hcpUpdatedAt), sql`${hcpCustomers.hcpUpdatedAt} <= excluded.hcp_updated_at`),
      });
    counts.bump('customers');
  }

  const row = mapJob(job, now);
  const update = omit(row, ['hcpJobId', 'createdAt']);
  const written = await db
    .insert(hcpJobs)
    .values(row)
    .onConflictDoUpdate({
      target: hcpJobs.hcpJobId,
      set: update,
      setWhere: or(isNull(hcpJobs.hcpUpdatedAt), sql`${hcpJobs.hcpUpdatedAt} <= excluded.hcp_updated_at`),
    })
    .returning({ id: hcpJobs.hcpJobId });
  if (written.length === 0) {
    // The stored job is newer than this snapshot (a webhook landed first): keep its children too.
    counts.bump('stale_skipped');
    return;
  }
  counts.bump('jobs');

  // Assignees: replace the set for this job in one transaction (neon-http batches run atomically).
  const techIds = await ensureTechnicianIds(db, job.assigned_employees ?? [], now);
  const deleteAssignees = db.delete(hcpJobAssignees).where(eq(hcpJobAssignees.hcpJobId, job.id));
  if (techIds.length > 0) {
    await db.batch([
      deleteAssignees,
      db
        .insert(hcpJobAssignees)
        .values(techIds.map((technicianId) => ({ hcpJobId: job.id, technicianId })))
        .onConflictDoNothing(),
    ]);
  } else {
    await deleteAssignees;
  }

  // Appointments (only present when the job was fetched with expand[]=appointments).
  const appointments = job.schedule?.appointments;
  if (Array.isArray(appointments)) {
    for (const ap of appointments) {
      if (!ap?.id) continue;
      const a = mapAppointment(ap, job.id, now);
      await db.insert(hcpAppointments).values(a).onConflictDoUpdate({ target: hcpAppointments.hcpAppointmentId, set: a });
      counts.bump('appointments');
    }
  }

  if (invoices) {
    for (const inv of invoices) {
      if (!inv?.id) continue;
      const i = mapInvoice(inv, job.id, now);
      await db.insert(hcpInvoices).values(i).onConflictDoUpdate({ target: hcpInvoices.hcpInvoiceId, set: i });
      counts.bump('invoices');
      for (const p of inv.payments ?? []) {
        if (!p?.id) continue;
        const pay = mapPayment(p, inv.id, job.id, now);
        await db.insert(hcpPayments).values(pay).onConflictDoUpdate({ target: hcpPayments.hcpPaymentId, set: pay });
        counts.bump('payments');
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------------------------

async function storedUpdatedAt(db: Db, hcpJobIds: string[]): Promise<Map<string, Date | null>> {
  const out = new Map<string, Date | null>();
  if (hcpJobIds.length === 0) return out;
  const rows = await db
    .select({ id: hcpJobs.hcpJobId, updatedAt: hcpJobs.hcpUpdatedAt })
    .from(hcpJobs)
    .where(inArray(hcpJobs.hcpJobId, hcpJobIds));
  for (const r of rows) out.set(r.id, r.updatedAt);
  return out;
}

/** True when the incoming job is new or newer than what we have (so invoices are worth fetching). */
function isNewOrNewer(job: HcpJob, stored: Map<string, Date | null>): boolean {
  if (!stored.has(job.id)) return true;
  const have = stored.get(job.id);
  const incoming = parseHcpTimestamp(job.updated_at);
  if (!have || !incoming) return true;
  return incoming.getTime() > have.getTime();
}

async function syncJobList(deps: SyncDeps, jobs: HcpJob[], counts: ReturnType<typeof counter>, fetchInvoices: boolean) {
  const now = deps.now?.() ?? new Date();
  const stored = await storedUpdatedAt(
    deps.db,
    jobs.map((j) => j.id),
  );
  for (const job of jobs) {
    const changed = isNewOrNewer(job, stored);
    let invoices: HcpInvoice[] | null = null;
    if (fetchInvoices && changed) {
      invoices = await deps.hcp.jobInvoices(job.id);
      counts.bump('invoice_fetches');
    }
    if (!changed) counts.bump('unchanged');
    await upsertJobBundle(deps.db, job, invoices, now, counts);
  }
}

/** Jobs whose scheduled start falls in [start, end). */
export async function syncJobsWindow(deps: SyncDeps, start: Date, end: Date, counts = counter()): Promise<SyncCounts> {
  const jobs: HcpJob[] = [];
  for await (const job of deps.hcp.jobs({
    scheduled_start_min: start.toISOString(),
    scheduled_start_max: end.toISOString(),
    expand: ['appointments'],
    sort_by: 'updated_at',
    sort_direction: 'desc',
  })) {
    jobs.push(job);
  }
  counts.bump('window_jobs', jobs.length);
  await syncJobList(deps, jobs, counts, true);
  return stripCounter(counts);
}

/** Jobs updated since `since` regardless of schedule (reschedules, cancellations, new unscheduled). */
export async function syncRecentlyUpdated(
  deps: SyncDeps,
  since: Date,
  counts = counter(),
  maxPages = 20,
): Promise<SyncCounts> {
  const jobs: HcpJob[] = [];
  let pages = 0;
  let stop = false;
  for await (const job of deps.hcp.jobs({
    expand: ['appointments'],
    sort_by: 'updated_at',
    sort_direction: 'desc',
  })) {
    const updated = parseHcpTimestamp(job.updated_at);
    if (updated && updated.getTime() < since.getTime()) {
      stop = true;
      break;
    }
    jobs.push(job);
    // The generator paginates internally; cap total items to bound a runaway scan.
    if (jobs.length >= maxPages * 50) break;
  }
  counts.bump('recent_jobs', jobs.length);
  pages = Math.ceil(jobs.length / 50);
  counts.bump('recent_pages', pages);
  await syncJobList(deps, jobs, counts, true);
  if (!stop && jobs.length >= maxPages * 50) {
    // Only happens after a long outage. The newest updates were processed; the nightly 60-day
    // backfill window picks up the rest, so the run still counts as successful.
    counts.bump('recent_truncated');
    deps.log?.('[sync] recently-updated scan truncated', { fetched: jobs.length, since: since.toISOString() });
  }
  return stripCounter(counts);
}

export async function syncEmployees(deps: SyncDeps, counts = counter()): Promise<SyncCounts> {
  const now = deps.now?.() ?? new Date();
  const employees = await deps.hcp.employees();
  counts.bump('employees', await upsertEmployees(deps.db, employees, now));
  return stripCounter(counts);
}

export async function syncCatalog(deps: SyncDeps, counts = counter()): Promise<SyncCounts> {
  const [jobTypes, tags] = await Promise.all([deps.hcp.jobTypes(), deps.hcp.tags()]);
  const value = { job_types: jobTypes, tags, fetched_at: (deps.now?.() ?? new Date()).toISOString() };
  await deps.db
    .insert(appSettings)
    .values({ key: 'hcp_catalog', value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
  counts.bump('job_types', jobTypes.length);
  counts.bump('tags', tags.length);
  return stripCounter(counts);
}

/** Fetch one job (with appointments and invoices) and upsert it. Used by webhooks and admin tools. */
export async function syncSingleJob(deps: SyncDeps, hcpJobId: string, counts = counter()): Promise<SyncCounts> {
  const now = deps.now?.() ?? new Date();
  const job = await deps.hcp.job(hcpJobId, ['appointments']);
  if (!job.schedule?.appointments) {
    const appointments = await deps.hcp.jobAppointments(hcpJobId);
    job.schedule = { ...(job.schedule ?? { scheduled_start: null, scheduled_end: null, arrival_window: null }), appointments };
  }
  const invoices = await deps.hcp.jobInvoices(hcpJobId);
  await upsertJobBundle(deps.db, job, invoices, now, counts);
  return stripCounter(counts);
}

/** Mark a job deleted in HCP (we never remove rows). */
export async function markJobDeleted(db: Db, hcpJobId: string, at: Date): Promise<void> {
  await db.update(hcpJobs).set({ deletedAt: at, syncedAt: at }).where(eq(hcpJobs.hcpJobId, hcpJobId));
}

// ---------------------------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------------------------

export type SyncKind = 'reconcile' | 'backfill' | 'webhook' | 'manual' | 'employees';

export interface RunOptions {
  kind: SyncKind;
  trigger: string;
  startedBy?: string | null;
  windowStart?: Date;
  windowEnd?: Date;
}

export interface RunResult {
  runId: string;
  status: 'ok' | 'error';
  counts: SyncCounts;
  error?: string;
  durationMs: number;
}

const STUCK_RUN_MINUTES = 15;

/** A run still "running" after this long was killed (function timeout); mark it so it is not mistaken for live. */
export async function expireStuckRuns(db: Db, now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - STUCK_RUN_MINUTES * 60_000);
  const rows = await db
    .update(syncRuns)
    .set({ status: 'error', finishedAt: now, error: `timed out (no completion after ${STUCK_RUN_MINUTES} min)` })
    .where(and(eq(syncRuns.status, 'running'), lt(syncRuns.startedAt, cutoff)))
    .returning({ id: syncRuns.id });
  return rows.length;
}

/** Wrap a sync body in a sync_runs row. Errors are recorded, not thrown. */
export async function withSyncRun(
  deps: SyncDeps,
  options: RunOptions,
  body: (counts: ReturnType<typeof counter>) => Promise<void>,
): Promise<RunResult> {
  const startedAt = deps.now?.() ?? new Date();
  await expireStuckRuns(deps.db, startedAt);
  const [run] = await deps.db
    .insert(syncRuns)
    .values({
      kind: options.kind,
      trigger: options.trigger,
      startedAt,
      status: 'running',
      windowStart: options.windowStart ?? null,
      windowEnd: options.windowEnd ?? null,
      startedBy: options.startedBy ?? null,
      counts: {},
    })
    .returning({ id: syncRuns.id });
  const counts = counter();
  let status: 'ok' | 'error' = 'ok';
  let error: string | undefined;
  try {
    await body(counts);
  } catch (err) {
    status = 'error';
    error = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    deps.log?.(`[sync] ${options.kind} failed`, { runId: run.id, error });
  }
  const finishedAt = deps.now?.() ?? new Date();
  const finalCounts = stripCounter(counts);
  await deps.db
    .update(syncRuns)
    .set({ finishedAt, status, counts: finalCounts, error: error ?? null })
    .where(eq(syncRuns.id, run.id));
  return { runId: run.id, status, counts: finalCounts, error, durationMs: finishedAt.getTime() - startedAt.getTime() };
}

/** Start of the last successful run of the given kinds, used as the updated-since watermark. */
export async function lastSuccessfulRunStart(db: Db, kinds: SyncKind[]): Promise<Date | null> {
  const [row] = await db
    .select({ startedAt: syncRuns.startedAt })
    .from(syncRuns)
    .where(and(inArray(syncRuns.kind, kinds), eq(syncRuns.status, 'ok')))
    .orderBy(sql`${syncRuns.startedAt} desc`)
    .limit(1);
  return row?.startedAt ?? null;
}

export interface ReconcileOptions {
  trigger: string;
  startedBy?: string | null;
  /** Days before today (NY) to include. */
  daysBack?: number;
  /** Days after today (NY) to include. */
  daysAhead?: number;
}

export async function runReconcile(deps: SyncDeps, options: ReconcileOptions): Promise<RunResult> {
  const now = deps.now?.() ?? new Date();
  const today = todayAppDate(now);
  const start = appDayRange(addDays(today, -(options.daysBack ?? 2))).start;
  const end = appDayRange(addDays(today, options.daysAhead ?? 7)).end;
  // Only reconcile runs scan recently-updated jobs, so only they may advance the watermark.
  const last = await lastSuccessfulRunStart(deps.db, ['reconcile']);
  const since = new Date((last ?? new Date(now.getTime() - 24 * 3_600_000)).getTime() - 5 * 60_000);
  return withSyncRun(
    deps,
    { kind: 'reconcile', trigger: options.trigger, startedBy: options.startedBy, windowStart: start, windowEnd: end },
    async (counts) => {
      await syncJobsWindow(deps, start, end, counts);
      await syncRecentlyUpdated(deps, since, counts);
    },
  );
}

export async function runBackfill(deps: SyncDeps, trigger = 'cron'): Promise<RunResult> {
  const now = deps.now?.() ?? new Date();
  const today = todayAppDate(now);
  const start = appDayRange(addDays(today, -30)).start;
  const end = appDayRange(addDays(today, 30)).end;
  return withSyncRun(deps, { kind: 'backfill', trigger, windowStart: start, windowEnd: end }, async (counts) => {
    await syncEmployees(deps, counts);
    await syncCatalog(deps, counts);
    await syncJobsWindow(deps, start, end, counts);
  });
}

/** One NY calendar day, from the call queue's refresh button. */
export async function runManualRefresh(deps: SyncDeps, date: IsoDate, startedBy: string): Promise<RunResult> {
  const { start, end } = appDayRange(date);
  return withSyncRun(deps, { kind: 'manual', trigger: 'user', startedBy, windowStart: start, windowEnd: end }, async (counts) => {
    await syncJobsWindow(deps, start, end, counts);
  });
}

/** Seconds since the most recent manual run started, or null when none exists. */
export async function secondsSinceLastManualRun(db: Db, now: Date): Promise<number | null> {
  const [row] = await db
    .select({ startedAt: syncRuns.startedAt })
    .from(syncRuns)
    .where(and(eq(syncRuns.kind, 'manual'), gt(syncRuns.startedAt, new Date(now.getTime() - 3_600_000))))
    .orderBy(sql`${syncRuns.startedAt} desc`)
    .limit(1);
  return row ? (now.getTime() - row.startedAt.getTime()) / 1000 : null;
}
