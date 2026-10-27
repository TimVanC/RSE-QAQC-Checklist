import 'server-only';
import { desc, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/src/db';
import { callLog } from '@/src/db/schema/calls';
import { appUsers } from '@/src/db/schema/users';
import type { CallOutcome, LastCall } from '@/src/lib/calls';

export interface CallLogEntry {
  id: string;
  callDate: string;
  outcome: CallOutcome;
  note: string | null;
  calledAt: Date;
  calledByName: string | null;
}

/** Every call attempt for a job, newest first. */
export async function getCallLogForJob(hcpJobId: string): Promise<CallLogEntry[]> {
  const db = getDb();
  return db
    .select({
      id: callLog.id,
      callDate: callLog.callDate,
      outcome: callLog.outcome,
      note: callLog.note,
      calledAt: callLog.calledAt,
      calledByName: appUsers.name,
    })
    .from(callLog)
    .leftJoin(appUsers, eq(appUsers.id, callLog.calledBy))
    .where(eq(callLog.hcpJobId, hcpJobId))
    .orderBy(desc(callLog.calledAt));
}

export interface JobCallSummary {
  last: LastCall;
  attempts: number;
}

/** Newest attempt and attempt count per job, for the queue and tracker badges. */
export async function getCallSummaries(
  jobIds: readonly string[],
): Promise<Map<string, JobCallSummary>> {
  const out = new Map<string, JobCallSummary>();
  if (jobIds.length === 0) return out;
  const db = getDb();
  const rows = await db
    .select({
      hcpJobId: callLog.hcpJobId,
      outcome: callLog.outcome,
      note: callLog.note,
      calledAt: callLog.calledAt,
      calledByName: appUsers.name,
    })
    .from(callLog)
    .leftJoin(appUsers, eq(appUsers.id, callLog.calledBy))
    .where(inArray(callLog.hcpJobId, [...jobIds]))
    .orderBy(desc(callLog.calledAt));
  for (const r of rows) {
    const existing = out.get(r.hcpJobId);
    if (existing) {
      existing.attempts += 1;
      continue;
    }
    out.set(r.hcpJobId, {
      attempts: 1,
      last: { outcome: r.outcome, at: r.calledAt, note: r.note, byName: r.calledByName },
    });
  }
  return out;
}
