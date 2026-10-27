import 'server-only';
import { and, desc, eq, exists, gte, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';
import { alias, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { getDb } from '@/src/db';
import { checklistScores, checklists } from '@/src/db/schema/checklists';
import { hcpAppointments, hcpJobAssignees, hcpJobs, technicians } from '@/src/db/schema/hcp';
import { appSettings, syncRuns, webhookEvents, type SyncRun } from '@/src/db/schema/system';
import { MAX_SPAN_DAYS, jobDayPosition, jobDays } from '@/src/lib/job-days';
import { addDays, appDayRange, type IsoDate } from '@/src/lib/time';
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
 * The call queue for one New Jersey calendar day: jobs running that day (not deleted, job type
 * not excluded by the admin), grouped by technician, each with its task checklist status and
 * callback count. A job runs on a day when its scheduled span or any of its appointments covers
 * it, so multi-day jobs appear on each of their days with a "Day 2 of 3" position.
 */
export async function getQueueForDate(date: IsoDate): Promise<QueueForDate> {
  const db = getDb();
  const { start, end } = appDayRange(date);
  // Spans are capped at MAX_SPAN_DAYS, so nothing that started earlier than that can run today.
  const earliestStart = appDayRange(addDays(date, -(MAX_SPAN_DAYS - 1))).start;
  const task = alias(checklists, 'task_checklist');
  const coversDay = (startAt: AnyPgColumn, endAt: AnyPgColumn) =>
    and(
      gte(startAt, earliestStart),
      lt(startAt, end),
      gte(sql`coalesce(${endAt}, ${startAt})`, start),
    );
  const appointmentToday = db
    .select({ one: sql`1` })
    .from(hcpAppointments)
    .where(
      and(
        eq(hcpAppointments.hcpJobId, hcpJobs.hcpJobId),
        coversDay(hcpAppointments.startAt, hcpAppointments.endAt),
      ),
    );

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
        isNull(hcpJobs.deletedAt),
        or(coversDay(hcpJobs.scheduledStart, hcpJobs.scheduledEnd), exists(appointmentToday)),
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
  const jobIds = [...new Set(kept.map((r) => r.hcpJobId))];
  const [calls, appointmentRows] = await Promise.all([
    getCallSummaries(jobIds),
    jobIds.length === 0
      ? []
      : db
          .select({
            hcpJobId: hcpAppointments.hcpJobId,
            startAt: hcpAppointments.startAt,
            endAt: hcpAppointments.endAt,
          })
          .from(hcpAppointments)
          .where(inArray(hcpAppointments.hcpJobId, jobIds)),
  ]);
  const appointmentsByJob = new Map<string, { startAt: Date | null; endAt: Date | null }[]>();
  for (const a of appointmentRows) {
    const list = appointmentsByJob.get(a.hcpJobId);
    if (list) list.push(a);
    else appointmentsByJob.set(a.hcpJobId, [a]);
  }
  const groups = groupQueueRows(
    kept.map((r) => {
      const c = calls.get(r.hcpJobId);
      const days = jobDays(
        { startAt: r.scheduledStart, endAt: r.scheduledEnd },
        appointmentsByJob.get(r.hcpJobId) ?? [],
      );
      return {
        ...r,
        lastCall: c?.last ?? null,
        callAttempts: c?.attempts ?? 0,
        dayPosition: jobDayPosition(days, date),
      };
    }),
  );
  const lastSync = last?.finishedAt ? { finishedAt: last.finishedAt, kind: last.kind } : null;
  return { date, groups, lastSync, asOf: new Date() };
}
