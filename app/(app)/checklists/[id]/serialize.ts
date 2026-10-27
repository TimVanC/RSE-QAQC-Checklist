import type { WorkspaceAnswer, WorkspaceData, WorkspaceScore } from '@/components/checklist/types';
import type { ChecklistDetail } from '@/src/server/queries/checklists';

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

function techName(t: { firstName: string; lastName: string; email: string | null }): string {
  return `${t.firstName} ${t.lastName}`.trim() || t.email || 'Unnamed technician';
}

/** Turn the server-side checklist detail into plain JSON for the client workspace. */
export function serializeChecklistDetail(detail: ChecklistDetail): WorkspaceData {
  const c = detail.checklist;
  const job = detail.job;

  const answers: Record<string, WorkspaceAnswer> = {};
  for (const [key, a] of Object.entries(detail.answers)) {
    answers[key] = {
      value: a.value ?? null,
      source: a.source,
      autoSuggestedValue: a.autoSuggestedValue ?? null,
      autoEvidence: a.autoEvidence ?? null,
    };
  }

  const s = detail.score;
  const score: WorkspaceScore | null = s
    ? {
        serviceQuote: s.serviceQuote,
        inProgress: s.inProgress,
        completed: s.completed,
        failOpsCheck: s.failOpsCheck,
        failQaqc: s.failQaqc,
        failToolControl: s.failToolControl,
        failCallback: s.failCallback,
        totalFailures: s.totalFailures,
        failuresValue: s.failuresValue,
        bottomLine: s.bottomLine,
        perfectTask: s.perfectTask,
        completedMarks: s.completedMarks,
      }
    : null;

  return {
    checklist: {
      id: c.id,
      type: c.type,
      status: c.status,
      parentChecklistId: c.parentChecklistId,
      callDate: c.callDate,
      projectType: c.projectType,
      customerName: c.customerName,
      projectLocation: c.projectLocation,
      projectDate: c.projectDate,
      referralProjectNo: c.referralProjectNo,
      permitSubmittedOn: c.permitSubmittedOn,
      permitFollowupOn: c.permitFollowupOn,
      permitApprovedOn: c.permitApprovedOn,
      partsReceivedOn: c.partsReceivedOn,
      partsOrderNo: c.partsOrderNo,
      notes: c.notes,
      submittedAt: iso(c.submittedAt),
      reopenedAt: iso(c.reopenedAt),
    },
    job: job
      ? {
          hcpJobId: job.hcpJobId,
          invoiceNumber: job.invoiceNumber,
          customerName: job.customerName,
          addressFormatted: job.addressFormatted,
          jobTypeName: job.jobTypeName,
          workStatus: job.workStatus,
          scheduledStart: iso(job.scheduledStart),
          scheduledEnd: iso(job.scheduledEnd),
          totalAmountCents: job.totalAmountCents,
        }
      : null,
    technicianName: detail.technician ? techName(detail.technician) : null,
    assignedTechnicians: detail.assignedTechnicians.map((t) => ({
      name: techName(t),
      mobile: t.mobile,
      email: t.email,
    })),
    answers,
    score,
    parent: detail.parent
      ? { id: detail.parent.id, type: detail.parent.type, status: detail.parent.status }
      : null,
    callbacks: detail.callbacks.map((cb) => ({
      id: cb.id,
      status: cb.status,
      createdAt: cb.createdAt.toISOString(),
      submittedAt: iso(cb.submittedAt),
    })),
    submittedByName: detail.submittedByName,
    reopenedByName: detail.reopenedByName,
    callLog: detail.callLog.map((e) => ({
      id: e.id,
      callDate: e.callDate,
      outcome: e.outcome,
      note: e.note,
      calledAt: e.calledAt.toISOString(),
      calledByName: e.calledByName,
    })),
    actions: detail.actions.map((a) => ({
      id: a.id,
      stepKey: a.stepKey,
      description: a.description,
      owner: a.owner,
      dueDate: a.dueDate,
      status: a.status,
      resolutionNote: a.resolutionNote,
      createdAt: a.createdAt.toISOString(),
      createdByName: a.createdByName,
      resolvedAt: iso(a.resolvedAt),
      resolvedByName: a.resolvedByName,
    })),
  };
}
