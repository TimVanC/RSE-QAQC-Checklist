import 'server-only';
import { and, asc, eq, getTableColumns, gt, or } from 'drizzle-orm';
import { CHECKLIST_STEPS, stepText, type ChecklistType } from '@/src/config/checklist-steps';
import { getDb, type Db } from '@/src/db';
import {
  checklistAnswers,
  checklistScores,
  checklists,
  payPeriods,
  type Checklist,
  type ChecklistAnswer,
  type ChecklistScoreRow,
} from '@/src/db/schema/checklists';
import { hcpJobAssignees, hcpJobs, technicians } from '@/src/db/schema/hcp';
import { auditLog } from '@/src/db/schema/system';
import { appUsers } from '@/src/db/schema/users';
import type { ExportDataset } from './catalog';

/**
 * Plain row arrays for the admin export (CSV and JSON). Column names are snake_case, matching the
 * database. Timestamps stay `Date` objects (ISO strings once serialised) and `date` columns stay
 * `YYYY-MM-DD` strings (New Jersey calendar days). People are exported by name, never by auth id.
 * Raw Housecall Pro payloads (`raw_json`) are deliberately left out.
 */

export type ExportRow = Record<string, unknown>;
type RowOf<C extends readonly string[]> = Record<C[number], unknown>;

/** Rows are fetched in keyset pages of this size so one response never nears the HTTP driver's limit. */
const PAGE_SIZE = 10_000;

// ---- helpers ---------------------------------------------------------------------------------

type DrizzleColumns = Record<string, { name: string }>;

function withoutRawJson<T extends Record<string, unknown>>(columns: T): Omit<T, 'rawJson'> {
  return Object.fromEntries(Object.entries(columns).filter(([key]) => key !== 'rawJson')) as Omit<
    T,
    'rawJson'
  >;
}

/** Re-key a row selected by property name (`hcpJobId`) to its database column name (`hcp_job_id`). */
function toColumnNames(row: Record<string, unknown>, columns: DrizzleColumns): ExportRow {
  const out: ExportRow = {};
  for (const [key, column] of Object.entries(columns)) out[column.name] = row[key];
  return out;
}

function columnNames(columns: DrizzleColumns): string[] {
  return Object.values(columns).map((column) => column.name);
}

function personName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim();
}

async function loadUserNames(db: Db): Promise<Map<string, string>> {
  const rows = await db
    .select({ id: appUsers.id, name: appUsers.name, email: appUsers.email })
    .from(appUsers);
  return new Map(rows.map((row) => [row.id, row.name || row.email]));
}

export interface TechnicianRef {
  name: string;
  hcpEmployeeId: string;
}

async function loadTechnicians(db: Db): Promise<Map<string, TechnicianRef>> {
  const rows = await db
    .select({
      id: technicians.id,
      firstName: technicians.firstName,
      lastName: technicians.lastName,
      hcpEmployeeId: technicians.hcpEmployeeId,
    })
    .from(technicians);
  return new Map(
    rows.map((row) => [
      row.id,
      {
        name: personName(row.firstName, row.lastName) || row.hcpEmployeeId,
        hcpEmployeeId: row.hcpEmployeeId,
      },
    ]),
  );
}

// ---- checklists ------------------------------------------------------------------------------

export const CHECKLIST_COLUMNS = [
  'id',
  'type',
  'status',
  'call_date',
  'technician',
  'hcp_employee_id',
  'hcp_job_id',
  'hcp_appointment_id',
  'invoice_number',
  'customer_name',
  'project_type',
  'project_location',
  'project_date',
  'referral_project_no',
  'permit_submitted_on',
  'permit_followup_on',
  'permit_approved_on',
  'parts_received_on',
  'parts_order_no',
  'notes',
  'config_version',
  'submitted_at',
  'submitted_by',
  'reopened_at',
  'reopened_by',
  'parent_checklist_id',
  'created_by',
  'created_at',
  'updated_at',
  // checklist_scores
  'service_quote',
  'in_progress',
  'completed',
  'fail_ops_check',
  'fail_qaqc',
  'fail_tool_control',
  'fail_callback',
  'total_failures',
  'failures_value',
  'bottom_line',
  'perfect_task',
  'completed_marks',
  'scores_computed_at',
] as const;

export interface ChecklistJoinRow {
  checklist: Checklist;
  score: ChecklistScoreRow | null;
  invoiceNumber: string | null;
}

/** Pure row mapping for `exportChecklists` (unit tested without a database). */
export function buildChecklistRows(
  rows: readonly ChecklistJoinRow[],
  techs: ReadonlyMap<string, TechnicianRef>,
  userNames: ReadonlyMap<string, string>,
): RowOf<typeof CHECKLIST_COLUMNS>[] {
  const userName = (id: string | null) => (id ? (userNames.get(id) ?? null) : null);
  return rows.map(({ checklist: c, score: s, invoiceNumber }) => {
    const tech = c.technicianId ? techs.get(c.technicianId) : undefined;
    return {
      id: c.id,
      type: c.type,
      status: c.status,
      call_date: c.callDate,
      technician: tech?.name ?? null,
      hcp_employee_id: tech?.hcpEmployeeId ?? null,
      hcp_job_id: c.hcpJobId,
      hcp_appointment_id: c.hcpAppointmentId,
      invoice_number: invoiceNumber,
      customer_name: c.customerName,
      project_type: c.projectType,
      project_location: c.projectLocation,
      project_date: c.projectDate,
      referral_project_no: c.referralProjectNo,
      permit_submitted_on: c.permitSubmittedOn,
      permit_followup_on: c.permitFollowupOn,
      permit_approved_on: c.permitApprovedOn,
      parts_received_on: c.partsReceivedOn,
      parts_order_no: c.partsOrderNo,
      notes: c.notes,
      config_version: c.configVersion,
      submitted_at: c.submittedAt,
      submitted_by: userName(c.submittedBy),
      reopened_at: c.reopenedAt,
      reopened_by: userName(c.reopenedBy),
      parent_checklist_id: c.parentChecklistId,
      created_by: userName(c.createdBy),
      created_at: c.createdAt,
      updated_at: c.updatedAt,
      service_quote: s?.serviceQuote ?? null,
      in_progress: s?.inProgress ?? null,
      completed: s?.completed ?? null,
      fail_ops_check: s?.failOpsCheck ?? null,
      fail_qaqc: s?.failQaqc ?? null,
      fail_tool_control: s?.failToolControl ?? null,
      fail_callback: s?.failCallback ?? null,
      total_failures: s?.totalFailures ?? null,
      failures_value: s?.failuresValue ?? null,
      bottom_line: s?.bottomLine ?? null,
      perfect_task: s?.perfectTask ?? null,
      completed_marks: s?.completedMarks ?? null,
      scores_computed_at: s?.computedAt ?? null,
    };
  });
}

/** One row per checklist (task and callback), joined to its stored score and the job's invoice number. */
export async function exportChecklists(): Promise<RowOf<typeof CHECKLIST_COLUMNS>[]> {
  const db = getDb();
  const [rows, techs, userNames] = await Promise.all([
    db
      .select({
        checklist: checklists,
        score: checklistScores,
        invoiceNumber: hcpJobs.invoiceNumber,
      })
      .from(checklists)
      .leftJoin(checklistScores, eq(checklistScores.checklistId, checklists.id))
      .leftJoin(hcpJobs, eq(hcpJobs.hcpJobId, checklists.hcpJobId))
      .orderBy(asc(checklists.callDate), asc(checklists.createdAt), asc(checklists.id)),
    loadTechnicians(db),
    loadUserNames(db),
  ]);
  return buildChecklistRows(rows, techs, userNames);
}

// ---- answers ---------------------------------------------------------------------------------

export const ANSWER_COLUMNS = [
  'checklist_id',
  'checklist_type',
  'call_date',
  'technician',
  'hcp_job_id',
  'step_key',
  'step_label',
  'step_number',
  'step_text',
  'workbook_cell',
  'value',
  'source',
  'auto_suggested_value',
  'auto_evidence',
  'answered_at',
  'answered_by',
] as const;

/** All stored answers, grouped by checklist then step key, read in keyset pages. */
async function loadAnswersByChecklist(db: Db): Promise<Map<string, Map<string, ChecklistAnswer>>> {
  const byChecklist = new Map<string, Map<string, ChecklistAnswer>>();
  let last: ChecklistAnswer | undefined;
  for (;;) {
    const page: ChecklistAnswer[] = await db
      .select()
      .from(checklistAnswers)
      .where(
        last
          ? or(
              gt(checklistAnswers.checklistId, last.checklistId),
              and(
                eq(checklistAnswers.checklistId, last.checklistId),
                gt(checklistAnswers.stepKey, last.stepKey),
              ),
            )
          : undefined,
      )
      .orderBy(asc(checklistAnswers.checklistId), asc(checklistAnswers.stepKey))
      .limit(PAGE_SIZE);
    for (const answer of page) {
      let steps = byChecklist.get(answer.checklistId);
      if (!steps) byChecklist.set(answer.checklistId, (steps = new Map()));
      steps.set(answer.stepKey, answer);
    }
    if (page.length < PAGE_SIZE) return byChecklist;
    last = page[page.length - 1];
  }
}

export interface AnswerChecklistRef {
  id: string;
  type: ChecklistType;
  callDate: string;
  hcpJobId: string;
  technicianId: string | null;
}

/**
 * Pure row mapping for `exportAnswers`: one row per checklist and step in `CHECKLIST_STEPS`, including
 * steps that were never answered (those rows have empty value/source). Step wording is the callback
 * wording on callback checklists.
 */
export function buildAnswerRows(
  lists: readonly AnswerChecklistRef[],
  answers: ReadonlyMap<string, ReadonlyMap<string, ChecklistAnswer>>,
  techs: ReadonlyMap<string, TechnicianRef>,
  userNames: ReadonlyMap<string, string>,
): RowOf<typeof ANSWER_COLUMNS>[] {
  const rows: RowOf<typeof ANSWER_COLUMNS>[] = [];
  for (const list of lists) {
    const tech = list.technicianId ? techs.get(list.technicianId) : undefined;
    const stored = answers.get(list.id);
    for (const step of CHECKLIST_STEPS) {
      const answer = stored?.get(step.key);
      rows.push({
        checklist_id: list.id,
        checklist_type: list.type,
        call_date: list.callDate,
        technician: tech?.name ?? null,
        hcp_job_id: list.hcpJobId,
        step_key: step.key,
        step_label: step.label,
        step_number: step.number,
        step_text: stepText(step, list.type),
        workbook_cell: step.workbookCell,
        value: answer?.value ?? null,
        source: answer?.source ?? null,
        auto_suggested_value: answer?.autoSuggestedValue ?? null,
        auto_evidence: answer?.autoEvidence ?? null,
        answered_at: answer?.answeredAt ?? null,
        answered_by: answer?.answeredBy ? (userNames.get(answer.answeredBy) ?? null) : null,
      });
    }
  }
  return rows;
}

/** One row per checklist and step, blanks included. */
export async function exportAnswers(): Promise<RowOf<typeof ANSWER_COLUMNS>[]> {
  const db = getDb();
  const [lists, answers, techs, userNames] = await Promise.all([
    db
      .select({
        id: checklists.id,
        type: checklists.type,
        callDate: checklists.callDate,
        hcpJobId: checklists.hcpJobId,
        technicianId: checklists.technicianId,
      })
      .from(checklists)
      .orderBy(asc(checklists.callDate), asc(checklists.createdAt), asc(checklists.id)),
    loadAnswersByChecklist(db),
    loadTechnicians(db),
    loadUserNames(db),
  ]);
  return buildAnswerRows(lists, answers, techs, userNames);
}

// ---- jobs ------------------------------------------------------------------------------------

const JOB_DB_COLUMNS = withoutRawJson(getTableColumns(hcpJobs));
export const JOB_COLUMNS = [
  ...columnNames(JOB_DB_COLUMNS),
  'assigned_technicians',
  'assigned_hcp_employee_ids',
];

/** Housecall Pro jobs (no raw payload) with the names and employee ids of the assigned technicians. */
export async function exportJobs(): Promise<ExportRow[]> {
  const db = getDb();
  const [rows, assignments, techs] = await Promise.all([
    db
      .select(JOB_DB_COLUMNS)
      .from(hcpJobs)
      .orderBy(asc(hcpJobs.scheduledStart), asc(hcpJobs.hcpJobId)),
    db
      .select({ hcpJobId: hcpJobAssignees.hcpJobId, technicianId: hcpJobAssignees.technicianId })
      .from(hcpJobAssignees),
    loadTechnicians(db),
  ]);

  const assigned = new Map<string, TechnicianRef[]>();
  for (const { hcpJobId, technicianId } of assignments) {
    const tech = techs.get(technicianId);
    if (!tech) continue;
    const list = assigned.get(hcpJobId);
    if (list) list.push(tech);
    else assigned.set(hcpJobId, [tech]);
  }

  return rows.map((row) => {
    const techsForJob = (assigned.get(row.hcpJobId) ?? []).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    return {
      ...toColumnNames(row, JOB_DB_COLUMNS),
      assigned_technicians: techsForJob.map((t) => t.name).join('; '),
      assigned_hcp_employee_ids: techsForJob.map((t) => t.hcpEmployeeId).join('; '),
    };
  });
}

// ---- technicians, pay periods, users ---------------------------------------------------------

const TECHNICIAN_DB_COLUMNS = withoutRawJson(getTableColumns(technicians));
export const TECHNICIAN_COLUMNS = columnNames(TECHNICIAN_DB_COLUMNS);

/** Housecall Pro employees (no raw payload). */
export async function exportTechnicians(): Promise<ExportRow[]> {
  const rows = await getDb()
    .select(TECHNICIAN_DB_COLUMNS)
    .from(technicians)
    .orderBy(asc(technicians.lastName), asc(technicians.firstName), asc(technicians.hcpEmployeeId));
  return rows.map((row) => toColumnNames(row, TECHNICIAN_DB_COLUMNS));
}

const PAY_PERIOD_DB_COLUMNS = getTableColumns(payPeriods);
export const PAY_PERIOD_COLUMNS = columnNames(PAY_PERIOD_DB_COLUMNS);

export async function exportPayPeriods(): Promise<ExportRow[]> {
  const rows = await getDb().select().from(payPeriods).orderBy(asc(payPeriods.startDate));
  return rows.map((row) => toColumnNames(row, PAY_PERIOD_DB_COLUMNS));
}

export const USER_COLUMNS = [
  'id',
  'email',
  'name',
  'role',
  'active',
  'last_login_at',
  'created_at',
] as const;

/** App users. Deliberately limited to these columns: no auth ids or invite metadata. */
export async function exportUsers(): Promise<RowOf<typeof USER_COLUMNS>[]> {
  const rows = await getDb()
    .select({
      id: appUsers.id,
      email: appUsers.email,
      name: appUsers.name,
      role: appUsers.role,
      active: appUsers.active,
      lastLoginAt: appUsers.lastLoginAt,
      createdAt: appUsers.createdAt,
    })
    .from(appUsers)
    .orderBy(asc(appUsers.name), asc(appUsers.email));
  return rows.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    active: u.active,
    last_login_at: u.lastLoginAt,
    created_at: u.createdAt,
  }));
}

// ---- audit log -------------------------------------------------------------------------------

export const AUDIT_LOG_COLUMNS = [
  'id',
  'at',
  'user_id',
  'user',
  'entity',
  'entity_id',
  'action',
  'before',
  'after',
] as const;

/** The audit trail, oldest first, read in keyset pages. `before` / `after` stay JSON objects. */
export async function exportAuditLog(): Promise<RowOf<typeof AUDIT_LOG_COLUMNS>[]> {
  const db = getDb();
  const userNames = await loadUserNames(db);
  const rows: RowOf<typeof AUDIT_LOG_COLUMNS>[] = [];
  let lastId: number | undefined;
  for (;;) {
    const page = await db
      .select()
      .from(auditLog)
      .where(lastId === undefined ? undefined : gt(auditLog.id, lastId))
      .orderBy(asc(auditLog.id))
      .limit(PAGE_SIZE);
    for (const entry of page) {
      rows.push({
        id: entry.id,
        at: entry.at,
        user_id: entry.userId,
        user: entry.userId ? (userNames.get(entry.userId) ?? null) : null,
        entity: entry.entity,
        entity_id: entry.entityId,
        action: entry.action,
        before: entry.before,
        after: entry.after,
      });
    }
    if (page.length < PAGE_SIZE) return rows;
    lastId = page[page.length - 1].id;
  }
}

// ---- registry --------------------------------------------------------------------------------

export interface DatasetDefinition {
  /** Fixed CSV header, so an empty dataset still downloads with its column names. */
  columns: readonly string[];
  load: () => Promise<ExportRow[]>;
}

export const DATASETS: Record<ExportDataset, DatasetDefinition> = {
  checklists: { columns: CHECKLIST_COLUMNS, load: exportChecklists },
  answers: { columns: ANSWER_COLUMNS, load: exportAnswers },
  jobs: { columns: JOB_COLUMNS, load: exportJobs },
  technicians: { columns: TECHNICIAN_COLUMNS, load: exportTechnicians },
  pay_periods: { columns: PAY_PERIOD_COLUMNS, load: exportPayPeriods },
  users: { columns: USER_COLUMNS, load: exportUsers },
  audit_log: { columns: AUDIT_LOG_COLUMNS, load: exportAuditLog },
};

export interface ExportAll {
  exported_at: string;
  checklists: ExportRow[];
  answers: ExportRow[];
  jobs: ExportRow[];
  technicians: ExportRow[];
  pay_periods: ExportRow[];
  users: ExportRow[];
  audit_log: ExportRow[];
}

/** Every dataset in one object, for the JSON dump. */
export async function exportAll(): Promise<ExportAll> {
  const [checklistRows, answerRows, jobRows, technicianRows, payPeriodRows, userRows, auditRows] =
    await Promise.all([
      exportChecklists(),
      exportAnswers(),
      exportJobs(),
      exportTechnicians(),
      exportPayPeriods(),
      exportUsers(),
      exportAuditLog(),
    ]);
  return {
    exported_at: new Date().toISOString(),
    checklists: checklistRows,
    answers: answerRows,
    jobs: jobRows,
    technicians: technicianRows,
    pay_periods: payPeriodRows,
    users: userRows,
    audit_log: auditRows,
  };
}
