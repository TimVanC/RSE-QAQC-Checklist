import 'server-only';
import { and, asc, eq, gte, isNull, lt, notIlike } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { getDb } from '@/src/db';
import { checklists } from '@/src/db/schema/checklists';
import type { ChecklistStatus } from '@/src/db/schema/enums';
import { hcpJobAssignees, hcpJobs, technicians } from '@/src/db/schema/hcp';
import { appSettings } from '@/src/db/schema/system';
import type { PayPeriodSpan } from '@/src/lib/pay-periods';
import { appDayRange, compareDates } from '@/src/lib/time';
import { getTrackingStartDate } from './settings';
import { excludeJobTypes, parseExcludedJobTypes } from './queue-groups';

const EXCLUDED_JOB_TYPES_KEY = 'excluded_job_types';

/** Where a job stands for pay validation: no checklist or not started counts as missing. */
export type TrackerStatus = 'submitted' | 'in_progress' | 'missing';

export interface TrackerTechnician {
  id: string;
  firstName: string;
  lastName: string;
  colorHex: string | null;
}

/** One (technician, job) pair as read from the database. */
export interface TrackerRow {
  technicianId: string;
  hcpJobId: string;
  invoiceNumber: string | null;
  customerName: string;
  jobTypeName: string | null;
  scheduledStart: Date | null;
  checklistId: string | null;
  checklistStatus: ChecklistStatus | null;
  callbackCount: number;
}

export interface TrackerJob {
  hcpJobId: string;
  invoiceNumber: string | null;
  customerName: string;
  jobTypeName: string | null;
  scheduledStart: Date | null;
  checklistId: string | null;
  checklistStatus: ChecklistStatus | null;
  status: TrackerStatus;
  callbackCount: number;
}

export interface TrackerCounts {
  jobs: number;
  submitted: number;
  inProgress: number;
  missing: number;
}

export interface TrackerGroup {
  technician: TrackerTechnician & { name: string };
  jobs: TrackerJob[];
  counts: TrackerCounts;
}

export interface Tracker {
  /** Every active technician, for the filter (whether or not they have jobs). */
  technicians: Array<TrackerTechnician & { name: string }>;
  /** One per technician in scope, including technicians without jobs; sorted by name. */
  groups: TrackerGroup[];
  /** Over distinct jobs: a job assigned to two technicians counts once. */
  totals: TrackerCounts;
  /** The technician filter in effect: null when none was given or it is not an active technician. */
  technicianId: string | null;
  /** Jobs before this NJ date are not counted (app_settings.tracking_start_date); null = all jobs. */
  trackingStartDate?: string | null;
  /** True when the tracking start date cut off part of the selected period. */
  trackingStartApplied?: boolean;
}

export function trackerStatus(status: ChecklistStatus | null | undefined): TrackerStatus {
  if (status === 'submitted') return 'submitted';
  if (status === 'in_progress') return 'in_progress';
  return 'missing';
}

export function countTrackerJobs(jobs: ReadonlyArray<{ status: TrackerStatus }>): TrackerCounts {
  const counts: TrackerCounts = { jobs: jobs.length, submitted: 0, inProgress: 0, missing: 0 };
  for (const job of jobs) {
    if (job.status === 'submitted') counts.submitted += 1;
    else if (job.status === 'in_progress') counts.inProgress += 1;
    else counts.missing += 1;
  }
  return counts;
}

const collator = new Intl.Collator('en-US', { sensitivity: 'base', numeric: true });

function technicianName(t: TrackerTechnician): string {
  return `${t.firstName} ${t.lastName}`.trim() || 'Unnamed technician';
}

function compareJobs(a: TrackerJob, b: TrackerJob): number {
  const at = a.scheduledStart?.getTime() ?? Number.POSITIVE_INFINITY;
  const bt = b.scheduledStart?.getTime() ?? Number.POSITIVE_INFINITY;
  if (at !== bt) return at < bt ? -1 : 1;
  return collator.compare(a.customerName, b.customerName) || a.hcpJobId.localeCompare(b.hcpJobId);
}

/**
 * Group (technician, job) rows into the completion tracker. Rows of excluded job types (trimmed,
 * case-insensitive) are dropped; rows for technicians not in `technicians` are ignored; with a
 * `technicianId` that is in `technicians` only that technician's group is kept (an unknown id is
 * ignored).
 */
export function buildTracker(input: {
  technicians: readonly TrackerTechnician[];
  rows: readonly TrackerRow[];
  excludedJobTypes?: readonly string[];
  technicianId?: string | null;
}): Tracker {
  const techs = input.technicians
    .map((t) => ({ ...t, name: technicianName(t) }))
    .sort(
      (a, b) =>
        collator.compare(a.firstName, b.firstName) ||
        collator.compare(a.lastName, b.lastName) ||
        a.id.localeCompare(b.id),
    );

  const rows = excludeJobTypes([...input.rows], [...(input.excludedJobTypes ?? [])]);
  const jobsByTech = new Map<string, Map<string, TrackerJob>>();
  for (const row of rows) {
    let jobs = jobsByTech.get(row.technicianId);
    if (!jobs) jobsByTech.set(row.technicianId, (jobs = new Map()));
    if (jobs.has(row.hcpJobId)) continue;
    jobs.set(row.hcpJobId, {
      hcpJobId: row.hcpJobId,
      invoiceNumber: row.invoiceNumber,
      customerName: row.customerName,
      jobTypeName: row.jobTypeName,
      scheduledStart: row.scheduledStart,
      checklistId: row.checklistId,
      checklistStatus: row.checklistStatus,
      status: trackerStatus(row.checklistStatus),
      callbackCount: Number(row.callbackCount) || 0,
    });
  }

  const requested = input.technicianId ?? null;
  const technicianId = requested && techs.some((t) => t.id === requested) ? requested : null;
  const inScope = technicianId ? techs.filter((t) => t.id === technicianId) : techs;
  const groups: TrackerGroup[] = inScope.map((technician) => {
    const jobs = [...(jobsByTech.get(technician.id)?.values() ?? [])].sort(compareJobs);
    return { technician, jobs, counts: countTrackerJobs(jobs) };
  });

  const distinct = new Map<string, TrackerJob>();
  for (const group of groups) for (const job of group.jobs) distinct.set(job.hcpJobId, job);

  return {
    technicians: techs,
    groups,
    totals: countTrackerJobs([...distinct.values()]),
    technicianId,
  };
}

/**
 * Completion tracker for a pay period: every job scheduled in the period (New Jersey days,
 * inclusive) that is not deleted or canceled, per active technician, with its task checklist
 * status and callback count. The technician filter is applied in memory (a period is at most a
 * few hundred jobs) so an unknown id simply falls back to all technicians.
 */
export async function getTracker(
  period: Pick<PayPeriodSpan, 'start_date' | 'end_date'>,
  technicianId?: string | null,
): Promise<Tracker> {
  const db = getDb();
  // Jobs before the tracking start date (set when the app went live) are not counted as missing.
  const trackingStartDate = await getTrackingStartDate();
  const trackingStartApplied = Boolean(trackingStartDate && compareDates(trackingStartDate, period.start_date) > 0);
  const effectiveStart = trackingStartApplied ? trackingStartDate! : period.start_date;
  const start = appDayRange(effectiveStart).start;
  const end = appDayRange(period.end_date).end;
  const task = alias(checklists, 'task_checklist');
  if (compareDates(effectiveStart, period.end_date) > 0) {
    return {
      ...(await buildTrackerEmpty(technicianId ?? null)),
      trackingStartDate,
      trackingStartApplied,
    };
  }

  const rowsQuery = db
    .select({
      technicianId: technicians.id,
      hcpJobId: hcpJobs.hcpJobId,
      invoiceNumber: hcpJobs.invoiceNumber,
      customerName: hcpJobs.customerName,
      jobTypeName: hcpJobs.jobTypeName,
      scheduledStart: hcpJobs.scheduledStart,
      checklistId: task.id,
      checklistStatus: task.status,
      callbackCount: db.$count(
        checklists,
        and(eq(checklists.hcpJobId, hcpJobs.hcpJobId), eq(checklists.type, 'callback')),
      ),
    })
    .from(hcpJobs)
    .innerJoin(hcpJobAssignees, eq(hcpJobAssignees.hcpJobId, hcpJobs.hcpJobId))
    .innerJoin(
      technicians,
      and(
        eq(technicians.id, hcpJobAssignees.technicianId),
        eq(technicians.isTechnician, true),
        eq(technicians.active, true),
      ),
    )
    .leftJoin(task, and(eq(task.hcpJobId, hcpJobs.hcpJobId), eq(task.type, 'task')))
    .where(
      and(
        gte(hcpJobs.scheduledStart, start),
        lt(hcpJobs.scheduledStart, end),
        isNull(hcpJobs.deletedAt),
        isNull(hcpJobs.canceledAt),
        // Housecall Pro marks cancellations in work_status ("pro canceled", "user canceled") too.
        notIlike(hcpJobs.workStatus, '%cancel%'),
      ),
    );

  const techniciansQuery = db
    .select({
      id: technicians.id,
      firstName: technicians.firstName,
      lastName: technicians.lastName,
      colorHex: technicians.colorHex,
    })
    .from(technicians)
    .where(and(eq(technicians.isTechnician, true), eq(technicians.active, true)))
    .orderBy(asc(technicians.firstName), asc(technicians.lastName));

  const settingQuery = db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, EXCLUDED_JOB_TYPES_KEY))
    .limit(1);

  const [rows, techRows, [setting]] = await Promise.all([
    rowsQuery,
    techniciansQuery,
    settingQuery,
  ]);

  return {
    ...buildTracker({
      technicians: techRows,
      rows,
      excludedJobTypes: parseExcludedJobTypes(setting?.value),
      technicianId: technicianId ?? null,
    }),
    trackingStartDate,
    trackingStartApplied,
  };
}

/** Tracker with no jobs (the whole period precedes the tracking start date). */
async function buildTrackerEmpty(technicianId: string | null): Promise<Tracker> {
  const techRows = await getDb()
    .select({
      id: technicians.id,
      firstName: technicians.firstName,
      lastName: technicians.lastName,
      colorHex: technicians.colorHex,
    })
    .from(technicians)
    .where(and(eq(technicians.isTechnician, true), eq(technicians.active, true)))
    .orderBy(asc(technicians.firstName), asc(technicians.lastName));
  return buildTracker({ technicians: techRows, rows: [], technicianId });
}
