/**
 * Pure shaping for the call queue: flat job x technician rows -> technician groups.
 * No database or server-only imports, so it is unit tested directly (tests/server/queue.test.ts).
 */
import type { ChecklistStatus } from '@/src/db/schema/enums';
import { failureLabels } from '@/src/lib/scoring/failure-labels';

/** Display status of a job's task checklist: `not_started` when no checklist row exists yet. */
export type ChecklistDisplayStatus = ChecklistStatus;

/** Simplified Housecall Pro work status for the queue badge. */
export type JobWorkState = 'scheduled' | 'in_progress' | 'completed' | 'canceled';

/** One row of the queue query: a job joined to at most one technician (null when none). */
export interface QueueRow {
  hcpJobId: string;
  invoiceNumber: string | null;
  customerName: string;
  addressFormatted: string | null;
  jobTypeName: string | null;
  tags: string[];
  workStatus: string;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  canceledAt: Date | null;
  totalAmountCents: number | null;
  /** Null when the job has no assignee, or the assignee is not a technician (office staff). */
  technicianId: string | null;
  technicianFirstName: string | null;
  technicianLastName: string | null;
  technicianColorHex: string | null;
  technicianMobile?: string | null;
  technicianEmail?: string | null;
  checklistId: string | null;
  checklistStatus: ChecklistStatus | null;
  checklistSubmittedAt: Date | null;
  checklistUpdatedAt: Date | null;
  failOpsCheck?: number | null;
  failQaqc?: number | null;
  failToolControl?: number | null;
  failCallback?: number | null;
  callbackCount: number;
}

export interface QueueChecklist {
  id: string;
  status: ChecklistStatus;
  submittedAt: Date | null;
  updatedAt: Date | null;
}

export interface QueueJob {
  hcpJobId: string;
  invoiceNumber: string | null;
  customerName: string;
  addressFormatted: string | null;
  jobTypeName: string | null;
  tags: string[];
  workStatus: string;
  workState: JobWorkState;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  canceledAt: Date | null;
  totalAmountCents: number | null;
  /** The job's task checklist, or null when nobody has opened it yet. */
  checklist: QueueChecklist | null;
  checklistStatus: ChecklistDisplayStatus;
  /** Workbook failure flags currently set on the checklist (empty when clean or not started). */
  failures: string[];
  callbackCount: number;
}

export interface QueueTechnician {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  colorHex: string | null;
  mobile: string | null;
  email: string | null;
}

export interface QueueGroup {
  /** Technician id, or `unassigned`. */
  key: string;
  /** Null for the Unassigned group. */
  technician: QueueTechnician | null;
  name: string;
  jobs: QueueJob[];
  submittedCount: number;
  canceledCount: number;
}

export const UNASSIGNED_KEY = 'unassigned';

/** Map HCP `work_status` plus the work timestamps to the four states the queue shows. */
export function jobWorkState(job: {
  workStatus: string;
  canceledAt: Date | null;
  completedAt: Date | null;
  startedAt: Date | null;
}): JobWorkState {
  const s = job.workStatus.trim().toLowerCase();
  if (job.canceledAt || s.includes('cancel')) return 'canceled';
  if (job.completedAt || s.startsWith('complete')) return 'completed';
  if (job.startedAt || s === 'in progress') return 'in_progress';
  return 'scheduled';
}

/** `app_settings.excluded_job_types` is a jsonb string array; anything else means "no exclusions". */
export function parseExcludedJobTypes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
    .map((v) => v.trim());
}

/** Drop rows whose job type is excluded (trimmed, case-insensitive). Jobs without a type are kept. */
export function excludeJobTypes<T extends { jobTypeName: string | null }>(
  rows: T[],
  excluded: string[],
): T[] {
  if (excluded.length === 0) return rows;
  const set = new Set(excluded.map((name) => name.trim().toLowerCase()));
  return rows.filter((r) => !r.jobTypeName || !set.has(r.jobTypeName.trim().toLowerCase()));
}

function technicianName(first: string, last: string): string {
  return `${first} ${last}`.trim() || 'Unnamed technician';
}

const collator = new Intl.Collator('en-US', { sensitivity: 'base', numeric: true });

function compareTechnicians(a: QueueTechnician, b: QueueTechnician): number {
  return (
    collator.compare(a.firstName, b.firstName) ||
    collator.compare(a.lastName, b.lastName) ||
    a.id.localeCompare(b.id)
  );
}

function compareJobs(a: QueueJob, b: QueueJob): number {
  const at = a.scheduledStart?.getTime() ?? Number.POSITIVE_INFINITY;
  const bt = b.scheduledStart?.getTime() ?? Number.POSITIVE_INFINITY;
  if (at !== bt) return at < bt ? -1 : 1;
  return collator.compare(a.customerName, b.customerName) || a.hcpJobId.localeCompare(b.hcpJobId);
}

function toJob(row: QueueRow): QueueJob {
  const checklist: QueueChecklist | null =
    row.checklistId && row.checklistStatus
      ? {
          id: row.checklistId,
          status: row.checklistStatus,
          submittedAt: row.checklistSubmittedAt,
          updatedAt: row.checklistUpdatedAt,
        }
      : null;
  return {
    hcpJobId: row.hcpJobId,
    invoiceNumber: row.invoiceNumber,
    customerName: row.customerName,
    addressFormatted: row.addressFormatted,
    jobTypeName: row.jobTypeName,
    tags: row.tags ?? [],
    workStatus: row.workStatus,
    workState: jobWorkState(row),
    scheduledStart: row.scheduledStart,
    scheduledEnd: row.scheduledEnd,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    canceledAt: row.canceledAt,
    totalAmountCents: row.totalAmountCents,
    checklist,
    checklistStatus: checklist?.status ?? 'not_started',
    failures: failureLabels(row),
    callbackCount: row.callbackCount,
  };
}

function makeGroup(key: string, technician: QueueTechnician | null, jobs: QueueJob[]): QueueGroup {
  jobs.sort(compareJobs);
  return {
    key,
    technician,
    name: technician?.name ?? 'Unassigned',
    jobs,
    submittedCount: jobs.filter((j) => j.checklistStatus === 'submitted').length,
    canceledCount: jobs.filter((j) => j.workState === 'canceled').length,
  };
}

/**
 * Group flat queue rows by technician. A job with several technicians appears under each of them;
 * a job with no technician rows (no assignee, or only non-technician staff) goes to "Unassigned".
 * Groups are ordered by technician first then last name, Unassigned last; jobs by scheduled start.
 */
export function groupQueueRows(rows: QueueRow[]): QueueGroup[] {
  const jobs = new Map<string, QueueJob>();
  const jobTechs = new Map<string, Set<string>>();
  const techs = new Map<string, QueueTechnician>();

  for (const row of rows) {
    let techIds = jobTechs.get(row.hcpJobId);
    if (!techIds) {
      jobs.set(row.hcpJobId, toJob(row));
      techIds = new Set();
      jobTechs.set(row.hcpJobId, techIds);
    }
    if (!row.technicianId) continue;
    techIds.add(row.technicianId);
    if (!techs.has(row.technicianId)) {
      const firstName = row.technicianFirstName ?? '';
      const lastName = row.technicianLastName ?? '';
      techs.set(row.technicianId, {
        id: row.technicianId,
        firstName,
        lastName,
        name: technicianName(firstName, lastName),
        colorHex: row.technicianColorHex,
        mobile: row.technicianMobile ?? null,
        email: row.technicianEmail ?? null,
      });
    }
  }

  const byTech = new Map<string, QueueJob[]>();
  const unassigned: QueueJob[] = [];
  for (const [jobId, job] of jobs) {
    const techIds = jobTechs.get(jobId) ?? new Set<string>();
    if (techIds.size === 0) unassigned.push(job);
    for (const id of techIds) {
      const list = byTech.get(id);
      if (list) list.push(job);
      else byTech.set(id, [job]);
    }
  }

  const groups = [...techs.values()]
    .sort(compareTechnicians)
    .map((tech) => makeGroup(tech.id, tech, byTech.get(tech.id) ?? []));
  if (unassigned.length > 0) groups.push(makeGroup(UNASSIGNED_KEY, null, unassigned));
  return groups;
}
