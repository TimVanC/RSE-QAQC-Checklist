/**
 * Serialisable shapes passed from the checklist page (server) to the workspace (client).
 * Dates are ISO strings; Housecall Pro raw JSON is never sent to the browser.
 */
import type { AnswerValue, ChecklistType, ProjectType } from '@/src/config/checklist-steps';
import type { AnswerSource, ChecklistStatus, Role } from '@/src/db/schema/enums';

export interface WorkspaceChecklist {
  id: string;
  type: ChecklistType;
  status: ChecklistStatus;
  parentChecklistId: string | null;
  callDate: string;
  projectType: ProjectType | null;
  customerName: string;
  projectLocation: string;
  projectDate: string | null;
  referralProjectNo: string;
  permitSubmittedOn: string | null;
  permitFollowupOn: string | null;
  permitApprovedOn: string | null;
  partsReceivedOn: string | null;
  partsOrderNo: string | null;
  notes: string | null;
  submittedAt: string | null;
  reopenedAt: string | null;
}

export interface WorkspaceJob {
  hcpJobId: string;
  invoiceNumber: string | null;
  customerName: string;
  addressFormatted: string | null;
  jobTypeName: string | null;
  workStatus: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  totalAmountCents: number | null;
}

export interface WorkspaceTechnician {
  name: string;
  mobile: string | null;
  email: string | null;
}

export interface WorkspaceAnswer {
  value: AnswerValue | null;
  source: AnswerSource;
  autoSuggestedValue: AnswerValue | null;
  autoEvidence: Record<string, unknown> | null;
}

/** camelCase score, as stored in checklist_scores and returned by saveAnswer / submitChecklist. */
export interface WorkspaceScore {
  serviceQuote: number;
  inProgress: number;
  completed: number;
  failOpsCheck: number;
  failQaqc: number;
  failToolControl: number;
  failCallback: number;
  totalFailures: number;
  failuresValue: number;
  bottomLine: number;
  perfectTask: number;
  completedMarks: number;
}

export interface WorkspaceLinkedChecklist {
  id: string;
  status: ChecklistStatus;
  createdAt: string;
  submittedAt: string | null;
}

export interface WorkspaceUser {
  id: string;
  name: string;
  role: Role;
}

export interface WorkspaceData {
  checklist: WorkspaceChecklist;
  job: WorkspaceJob | null;
  technicianName: string | null;
  assignedTechnicians: WorkspaceTechnician[];
  answers: Record<string, WorkspaceAnswer>;
  score: WorkspaceScore | null;
  parent: { id: string; type: ChecklistType; status: ChecklistStatus } | null;
  callbacks: WorkspaceLinkedChecklist[];
  submittedByName: string | null;
  reopenedByName: string | null;
}
