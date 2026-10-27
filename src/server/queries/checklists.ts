import 'server-only';
import { and, asc, desc, eq, inArray, ne } from 'drizzle-orm';
import { getDb } from '@/src/db';
import {
  checklistAnswers,
  checklistScores,
  checklists,
  type Checklist,
  type ChecklistAnswer,
  type ChecklistScoreRow,
} from '@/src/db/schema/checklists';
import {
  hcpInvoices,
  hcpJobAssignees,
  hcpJobs,
  hcpPayments,
  technicians,
  type HcpJobRow,
  type Technician,
} from '@/src/db/schema/hcp';
import { appUsers } from '@/src/db/schema/users';
import { computeAutoChecks, type AutoCheckMap } from '@/src/lib/hcp/auto-checks';
import { getCallLogForJob, type CallLogEntry } from './calls';

export interface ChecklistDetail {
  checklist: Checklist;
  job: HcpJobRow | null;
  technician: Technician | null;
  assignedTechnicians: Technician[];
  answers: Record<string, ChecklistAnswer>;
  score: ChecklistScoreRow | null;
  parent: Pick<Checklist, 'id' | 'type' | 'status'> | null;
  callbacks: Array<Pick<Checklist, 'id' | 'status' | 'createdAt' | 'submittedAt'>>;
  submittedByName: string | null;
  reopenedByName: string | null;
  /** Every call attempt for the job, newest first. */
  callLog: CallLogEntry[];
}

export async function getTaskChecklistForJob(hcpJobId: string): Promise<Checklist | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(checklists)
    .where(and(eq(checklists.hcpJobId, hcpJobId), eq(checklists.type, 'task')))
    .limit(1);
  return row ?? null;
}

export async function getChecklistDetail(id: string): Promise<ChecklistDetail | null> {
  const db = getDb();
  const [checklist] = await db.select().from(checklists).where(eq(checklists.id, id)).limit(1);
  if (!checklist) return null;

  const [job] = await db
    .select()
    .from(hcpJobs)
    .where(eq(hcpJobs.hcpJobId, checklist.hcpJobId))
    .limit(1);

  const assignedTechnicians = await db
    .select({ t: technicians })
    .from(technicians)
    .innerJoin(hcpJobAssignees, eq(hcpJobAssignees.technicianId, technicians.id))
    .where(eq(hcpJobAssignees.hcpJobId, checklist.hcpJobId))
    .then((rows) => rows.map((r) => r.t));

  let technician: Technician | null = null;
  if (checklist.technicianId) {
    [technician] = await db
      .select()
      .from(technicians)
      .where(eq(technicians.id, checklist.technicianId))
      .limit(1);
  }

  const answerRows = await db
    .select()
    .from(checklistAnswers)
    .where(eq(checklistAnswers.checklistId, id));
  const answers: Record<string, ChecklistAnswer> = {};
  for (const a of answerRows) answers[a.stepKey] = a;

  const [score] = await db
    .select()
    .from(checklistScores)
    .where(eq(checklistScores.checklistId, id))
    .limit(1);

  let parent: ChecklistDetail['parent'] = null;
  if (checklist.parentChecklistId) {
    const [p] = await db
      .select({ id: checklists.id, type: checklists.type, status: checklists.status })
      .from(checklists)
      .where(eq(checklists.id, checklist.parentChecklistId))
      .limit(1);
    parent = p ?? null;
  }

  const callLog = await getCallLogForJob(checklist.hcpJobId);

  const callbacks = await db
    .select({
      id: checklists.id,
      status: checklists.status,
      createdAt: checklists.createdAt,
      submittedAt: checklists.submittedAt,
    })
    .from(checklists)
    .where(eq(checklists.parentChecklistId, id))
    .orderBy(asc(checklists.createdAt));

  const userIds = [checklist.submittedBy, checklist.reopenedBy].filter((v): v is string =>
    Boolean(v),
  );
  const names = new Map<string, string>();
  if (userIds.length > 0) {
    const users = await db
      .select({ id: appUsers.id, name: appUsers.name })
      .from(appUsers)
      .where(inArray(appUsers.id, userIds));
    for (const u of users) names.set(u.id, u.name);
  }

  return {
    checklist,
    job: job ?? null,
    technician,
    assignedTechnicians,
    answers,
    score: score ?? null,
    parent,
    callbacks,
    submittedByName: checklist.submittedBy ? (names.get(checklist.submittedBy) ?? null) : null,
    reopenedByName: checklist.reopenedBy ? (names.get(checklist.reopenedBy) ?? null) : null,
    callLog,
  };
}

/** Auto-check suggestions for a job from the mirrored Housecall Pro data. */
export async function computeAutoChecksForJob(hcpJobId: string): Promise<AutoCheckMap> {
  const db = getDb();
  const [job] = await db.select().from(hcpJobs).where(eq(hcpJobs.hcpJobId, hcpJobId)).limit(1);
  if (!job) return {};

  const invoices = await db
    .select({
      hcpInvoiceId: hcpInvoices.hcpInvoiceId,
      invoiceNumber: hcpInvoices.invoiceNumber,
      status: hcpInvoices.status,
      paidAt: hcpInvoices.paidAt,
      dueAmountCents: hcpInvoices.dueAmountCents,
    })
    .from(hcpInvoices)
    .where(eq(hcpInvoices.hcpJobId, hcpJobId));

  const customerJobs = job.hcpCustomerId
    ? await db
        .select({
          hcpJobId: hcpJobs.hcpJobId,
          invoiceNumber: hcpJobs.invoiceNumber,
          scheduledStart: hcpJobs.scheduledStart,
          canceledAt: hcpJobs.canceledAt,
        })
        .from(hcpJobs)
        .where(and(eq(hcpJobs.hcpCustomerId, job.hcpCustomerId), ne(hcpJobs.hcpJobId, hcpJobId)))
    : [];

  const jobIds = [hcpJobId, ...customerJobs.map((j) => j.hcpJobId)];
  const payments = await db
    .select({
      hcpPaymentId: hcpPayments.hcpPaymentId,
      hcpJobId: hcpPayments.hcpJobId,
      amountCents: hcpPayments.amountCents,
      paidAt: hcpPayments.paidAt,
    })
    .from(hcpPayments)
    .where(inArray(hcpPayments.hcpJobId, jobIds))
    .orderBy(desc(hcpPayments.paidAt));

  return computeAutoChecks({ job, invoices, payments, customerJobs });
}
