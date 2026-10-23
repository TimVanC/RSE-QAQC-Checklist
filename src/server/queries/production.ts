import 'server-only';
import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import type { ChecklistType } from '@/src/config/checklist-steps';
import { getDb } from '@/src/db';
import { checklistScores, checklists } from '@/src/db/schema/checklists';
import type { ChecklistStatus } from '@/src/db/schema/enums';
import { hcpJobAssignees, technicians } from '@/src/db/schema/hcp';
import type { PayPeriodSpan } from '@/src/lib/pay-periods';
import type { Flag } from '@/src/lib/scoring/checklist-score';
import {
  rollupProduction,
  type ProductionRollup,
  type ScoredChecklist,
} from '@/src/lib/scoring/rollup';

export interface ProductionTechnician {
  id: string;
  firstName: string;
  lastName: string;
  isTechnician: boolean;
  active: boolean;
}

/** One checklist in the period with its stored score (score columns are null without a score row). */
export interface ProductionChecklistRow {
  /** Technician the checklist was created for (fallback when no assignees are known). */
  technicianId: string | null;
  /**
   * Every technician assigned to the job in Housecall Pro. A shared job credits each of them
   * (as it would appear in each of their workbooks); totals still count the checklist once.
   */
  technicianIds?: readonly string[];
  type: ChecklistType;
  status: ChecklistStatus;
  serviceQuote: number | null;
  inProgress: number | null;
  completed: number | null;
  perfectTask: number | null;
  failuresValue: number | null;
}

export interface ProductionLine {
  /** null for checklists without a technician (or one no longer in the technicians table). */
  technicianId: string | null;
  name: string;
  rollup: ProductionRollup;
  /** Checklists of either type with status `submitted`. */
  submitted: number;
  /** All checklists of either type, any status. */
  checklists: number;
}

export interface Production {
  rows: ProductionLine[];
  /** Rollup over every checklist in the period (not a sum of the row percentages). */
  totals: ProductionLine;
}

const UNASSIGNED = 'No technician';

function flag(value: number | null): Flag {
  return value !== null && value > 0 ? 1 : 0;
}

export function toScoredChecklist(row: ProductionChecklistRow): ScoredChecklist {
  return {
    type: row.type,
    score: {
      service_quote: flag(row.serviceQuote),
      in_progress: flag(row.inProgress),
      completed: flag(row.completed),
      perfect_task: flag(row.perfectTask),
      failures_value: flag(row.failuresValue),
    },
  };
}

function line(
  technicianId: string | null,
  name: string,
  rows: readonly ProductionChecklistRow[],
): ProductionLine {
  return {
    technicianId,
    name,
    rollup: rollupProduction(rows.map(toScoredChecklist)),
    submitted: rows.filter((r) => r.status === 'submitted').length,
    checklists: rows.length,
  };
}

const collator = new Intl.Collator('en-US', { sensitivity: 'base', numeric: true });

/**
 * Per-technician production for a set of checklists, using the workbook rollup (task checklists
 * only; callbacks counted separately). Active technicians always get a row; inactive or
 * non-technician staff only when they have checklists; unassigned checklists get a final row.
 */
export function buildProduction(
  techs: readonly ProductionTechnician[],
  rows: readonly ProductionChecklistRow[],
): Production {
  const known = new Map(techs.map((t) => [t.id, t]));
  const byTech = new Map<string | null, ProductionChecklistRow[]>();
  const add = (key: string | null, row: ProductionChecklistRow) => {
    const list = byTech.get(key);
    if (list) list.push(row);
    else byTech.set(key, [row]);
  };
  for (const row of rows) {
    const candidates = row.technicianIds?.length ? row.technicianIds : row.technicianId ? [row.technicianId] : [];
    const keys = [...new Set(candidates.filter((id) => known.has(id)))];
    if (keys.length === 0) add(null, row);
    for (const key of keys) add(key, row);
  }

  const listed = techs
    .filter((t) => (t.isTechnician && t.active) || byTech.has(t.id))
    .sort(
      (a, b) =>
        collator.compare(a.firstName, b.firstName) ||
        collator.compare(a.lastName, b.lastName) ||
        a.id.localeCompare(b.id),
    );

  const out = listed.map((t) =>
    line(
      t.id,
      `${t.firstName} ${t.lastName}`.trim() || 'Unnamed technician',
      byTech.get(t.id) ?? [],
    ),
  );
  const unassigned = byTech.get(null);
  if (unassigned) out.push(line(null, UNASSIGNED, unassigned));

  return { rows: out, totals: line(null, 'Total', rows) };
}

/** Production counts for checklists whose call date falls in the period (calendar dates, inclusive). */
export async function getProduction(
  period: Pick<PayPeriodSpan, 'start_date' | 'end_date'>,
): Promise<Production> {
  const db = getDb();
  const [rawRows, techs] = await Promise.all([
    db
      .select({
        hcpJobId: checklists.hcpJobId,
        technicianId: checklists.technicianId,
        type: checklists.type,
        status: checklists.status,
        serviceQuote: checklistScores.serviceQuote,
        inProgress: checklistScores.inProgress,
        completed: checklistScores.completed,
        perfectTask: checklistScores.perfectTask,
        failuresValue: checklistScores.failuresValue,
      })
      .from(checklists)
      .leftJoin(checklistScores, eq(checklistScores.checklistId, checklists.id))
      .where(
        and(gte(checklists.callDate, period.start_date), lte(checklists.callDate, period.end_date)),
      ),
    db
      .select({
        id: technicians.id,
        firstName: technicians.firstName,
        lastName: technicians.lastName,
        isTechnician: technicians.isTechnician,
        active: technicians.active,
      })
      .from(technicians),
  ]);

  // Every technician assigned to each job, so shared jobs credit everyone on them.
  const jobIds = [...new Set(rawRows.map((r) => r.hcpJobId))];
  const assigneeRows =
    jobIds.length === 0
      ? []
      : await db
          .select({ hcpJobId: hcpJobAssignees.hcpJobId, technicianId: hcpJobAssignees.technicianId })
          .from(hcpJobAssignees)
          .innerJoin(technicians, and(eq(technicians.id, hcpJobAssignees.technicianId), eq(technicians.isTechnician, true)))
          .where(inArray(hcpJobAssignees.hcpJobId, jobIds));
  const assigneesByJob = new Map<string, string[]>();
  for (const a of assigneeRows) {
    const list = assigneesByJob.get(a.hcpJobId);
    if (list) list.push(a.technicianId);
    else assigneesByJob.set(a.hcpJobId, [a.technicianId]);
  }
  const rows: ProductionChecklistRow[] = rawRows.map(({ hcpJobId, ...row }) => ({
    ...row,
    technicianIds: assigneesByJob.get(hcpJobId) ?? [],
  }));
  return buildProduction(techs, rows);
}
