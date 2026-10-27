import 'server-only';
import { and, desc, eq, gte, isNotNull, isNull, lt } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { getDb } from '@/src/db';
import { checklistScores, checklists } from '@/src/db/schema/checklists';
import { hcpJobAssignees, hcpJobs, technicians } from '@/src/db/schema/hcp';
import { appSettings, syncRuns, webhookEvents, type SyncRun } from '@/src/db/schema/system';
import { appDayRange, type IsoDate } from '@/src/lib/time';
import { getCallSummaries } from './calls';
import {
  excludeJobTypes,
  groupQueueRows,
  parseExcludedJobTypes,
  type QueueGroup,
  type QueueRow,
} from './queue-groups';

export {
  groupQueueRows,
  type ChecklistDisplayStatus,
  type JobWorkState,
  type QueueGroup,
  type QueueJob,
  type QueueRow,
  type QueueTechnician,
} from './queue-groups';

export const EXCLUDED_JOB_TYPES_KEY = 'excluded_job_types';

export interface QueueLastSync {
  finishedAt: Date;
  kind: SyncRun['kind'];
}

export interface QueueForDate {
  date: IsoDate;
  groups: QueueGroup[];
  lastSync: QueueLastSync | null;
  /** When the queue was read; the relative "Updated X min ago" is computed against it on the server. */
  asOf: Date;
}

/**
 * The call queue for one New Jersey calendar day: jobs scheduled that day (not deleted, job type
 * not excluded by the admin), grouped by technician, each with its task checklist status and
 * callback count. Three independent queries, run in parallel.
 */
export async function getQueueForDate(date: IsoDate): Promise<QueueForDate> {
  const db = getDb();
  const { start, end } = appDayRange(date);
  const task = alias(checklists, 'task_checklist');

  const rowsQuery = db
    .select({
      hcpJobId: hcpJobs.hcpJobId,
      invoiceNumber: hcpJobs.invoiceNumber,
      customerName: hcpJobs.customerName,
      addressFormatted: hcpJobs.addressFormatted,
      jobTypeName: hcpJobs.jobTypeName,
      tags: hcpJobs.tags,
      workStatus: hcpJobs.workStatus,
      scheduledStart: hcpJobs.scheduledStart,
      scheduledEnd: hcpJobs.scheduledEnd,
      startedAt: hcpJobs.startedAt,
      completedAt: hcpJobs.completedAt,
      canceledAt: hcpJobs.canceledAt,
      totalAmountCents: hcpJobs.totalAmountCents,
      technicianId: technicians.id,
      technicianFirstName: technicians.firstName,
      technicianLastName: technicians.lastName,
      technicianColorHex: technicians.colorHex,
      technicianMobile: technicians.mobile,
      technicianEmail: technicians.email,
      checklistId: task.id,
      checklistStatus: task.status,
      checklistSubmittedAt: task.submittedAt,
      checklistUpdatedAt: task.updatedAt,
      failOpsCheck: checklistScores.failOpsCheck,
      failQaqc: checklistScores.failQaqc,
      failToolControl: checklistScores.failToolControl,
      failCallback: checklistScores.failCallback,
      callbackCount: db.$count(
        checklists,
        and(eq(checklists.hcpJobId, hcpJobs.hcpJobId), eq(checklists.type, 'callback')),
      ),
    })
    .from(hcpJobs)
    .leftJoin(hcpJobAssignees, eq(hcpJobAssignees.hcpJobId, hcpJobs.hcpJobId))
    // Non-technician staff (office, sales) do not get their own queue section.
    .leftJoin(
      technicians,
      and(eq(technicians.id, hcpJobAssignees.technicianId), eq(technicians.isTechnician, true)),
    )
    .leftJoin(task, and(eq(task.hcpJobId, hcpJobs.hcpJobId), eq(task.type, 'task')))
    .leftJoin(checklistScores, eq(checklistScores.checklistId, task.id))
    .where(
      and(
        gte(hcpJobs.scheduledStart, start),
        lt(hcpJobs.scheduledStart, end),
        isNull(hcpJobs.deletedAt),
      ),
    );

  const settingQuery = db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, EXCLUDED_JOB_TYPES_KEY))
    .limit(1);

  const lastSyncQuery = db
    .select({ finishedAt: syncRuns.finishedAt, kind: syncRuns.kind })
    .from(syncRuns)
    .where(and(eq(syncRuns.status, 'ok'), isNotNull(syncRuns.finishedAt)))
    .orderBy(desc(syncRuns.finishedAt))
    .limit(1);

  // Webhooks refresh data without a sync_runs row, so the newest processed event counts as a sync too.
  const lastWebhookQuery = db
    .select({ processedAt: webhookEvents.processedAt })
    .from(webhookEvents)
    .where(and(eq(webhookEvents.status, 'processed'), isNotNull(webhookEvents.processedAt)))
    .orderBy(desc(webhookEvents.processedAt))
    .limit(1);
  const [rows, [setting], [lastRun], [lastWebhook]] = await Promise.all([
    rowsQuery,
    settingQuery,
    lastSyncQuery,
    lastWebhookQuery,
  ]);
  const last =
    lastWebhook?.processedAt &&
    (!lastRun?.finishedAt || lastWebhook.processedAt > lastRun.finishedAt)
      ? { finishedAt: lastWebhook.processedAt, kind: 'webhook' as const }
      : lastRun;

  const excluded = parseExcludedJobTypes(setting?.value);
  const kept = excludeJobTypes<QueueRow>(rows, excluded);
  const calls = await getCallSummaries([...new Set(kept.map((r) => r.hcpJobId))]);
  const groups = groupQueueRows(
    kept.map((r) => {
      const c = calls.get(r.hcpJobId);
      return { ...r, lastCall: c?.last ?? null, callAttempts: c?.attempts ?? 0 };
    }),
  );
  const lastSync = last?.finishedAt ? { finishedAt: last.finishedAt, kind: last.kind } : null;
  return { date, groups, lastSync, asOf: new Date() };
}
