import 'server-only';
import { and, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { getDb } from '@/src/db';
import { checklists } from '@/src/db/schema/checklists';
import { correctiveActions } from '@/src/db/schema/corrective-actions';
import { hcpJobs, technicians } from '@/src/db/schema/hcp';
import { appUsers } from '@/src/db/schema/users';
import { sortActions, type ActionStatus } from '@/src/lib/corrective-actions';

export interface CorrectiveActionEntry {
  id: string;
  checklistId: string;
  stepKey: string;
  description: string;
  owner: string;
  dueDate: string | null;
  status: ActionStatus;
  resolutionNote: string | null;
  createdAt: Date;
  createdByName: string | null;
  resolvedAt: Date | null;
  resolvedByName: string | null;
}

/** An open action with enough job context for the tracker's Open actions list. */
export interface OpenActionEntry extends CorrectiveActionEntry {
  hcpJobId: string;
  customerName: string;
  invoiceNumber: string | null;
  callDate: string;
  technicianName: string | null;
}

const creator = alias(appUsers, 'creator');
const resolver = alias(appUsers, 'resolver');

const entryColumns = {
  id: correctiveActions.id,
  checklistId: correctiveActions.checklistId,
  stepKey: correctiveActions.stepKey,
  description: correctiveActions.description,
  owner: correctiveActions.owner,
  dueDate: correctiveActions.dueDate,
  status: correctiveActions.status,
  resolutionNote: correctiveActions.resolutionNote,
  createdAt: correctiveActions.createdAt,
  createdByName: creator.name,
  resolvedAt: correctiveActions.resolvedAt,
  resolvedByName: resolver.name,
};

/** Every action on a checklist, open first then by due date. */
export async function getActionsForChecklist(
  checklistId: string,
): Promise<CorrectiveActionEntry[]> {
  const rows = await getDb()
    .select(entryColumns)
    .from(correctiveActions)
    .leftJoin(creator, eq(creator.id, correctiveActions.createdBy))
    .leftJoin(resolver, eq(resolver.id, correctiveActions.resolvedBy))
    .where(eq(correctiveActions.checklistId, checklistId));
  return sortActions(rows);
}

/** Every open action across all jobs, earliest due first, for the tracker. */
export async function getOpenActions(): Promise<OpenActionEntry[]> {
  const rows = await getDb()
    .select({
      ...entryColumns,
      hcpJobId: checklists.hcpJobId,
      customerName: hcpJobs.customerName,
      invoiceNumber: hcpJobs.invoiceNumber,
      callDate: checklists.callDate,
      technicianFirstName: technicians.firstName,
      technicianLastName: technicians.lastName,
    })
    .from(correctiveActions)
    .innerJoin(checklists, eq(checklists.id, correctiveActions.checklistId))
    .innerJoin(hcpJobs, eq(hcpJobs.hcpJobId, checklists.hcpJobId))
    .leftJoin(technicians, eq(technicians.id, checklists.technicianId))
    .leftJoin(creator, eq(creator.id, correctiveActions.createdBy))
    .leftJoin(resolver, eq(resolver.id, correctiveActions.resolvedBy))
    .where(and(eq(correctiveActions.status, 'open')));
  return sortActions(
    rows.map(({ technicianFirstName, technicianLastName, ...r }) => ({
      ...r,
      technicianName:
        technicianFirstName || technicianLastName
          ? `${technicianFirstName ?? ''} ${technicianLastName ?? ''}`.trim()
          : null,
    })),
  );
}
