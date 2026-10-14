/**
 * Checklist step definitions.
 *
 * Source of truth for wording and cell positions is the RSE workbook
 * `RSE ENERGY GROUP CHECKLISTS CAO 3JUL2026.xlsx`, tab `Task1` (column B text, column M answers).
 * See docs/discovery/workbook-analysis.md for the full cell map and formula analysis.
 *
 * Wording is verbatim, including the workbook's spelling.
 */

export const CHECKLIST_CONFIG_VERSION = 1;

export type AnswerValue = 'Y' | 'N' | 'B';
export const ANSWER_VALUES: readonly AnswerValue[] = ['Y', 'N', 'B'];

export type ChecklistType = 'task' | 'callback';
export type StepKind = 'step' | 'sub';

/** Which workbook formula a step feeds. Exactly seven steps carry a role. */
export type ScoringRole =
  | 'service_quote' // C81 = COUNTIF(M11,"Y")   step 2 == Y
  | 'in_progress' // C82 = COUNTIF(M36,"Y")   step 17 == Y
  | 'completed' // C83 = COUNTIF(M64,"Y")   step 34 == Y
  | 'fail_ops_check' // C86 = COUNTIF(M43,"Y")   step 22 == Y
  | 'fail_qaqc' // C87 = COUNTIF(M44,"N")   step 23 == N
  | 'fail_tool_control' // C88 = COUNTIF(M47,"N")   step 26 == N
  | 'fail_callback'; // C89 = COUNTIF(M58,"Y")   step 31 == Y

/** Housecall Pro evidence that can suggest an answer. Suggestions never auto-submit. */
export type AutoCheck =
  | 'arrival' // started_at vs scheduled_start (step 1)
  | 'follow_up_job' // later job for the same customer exists (step 10)
  | 'deposit' // payment on this job/customer before the work date (step 11)
  | 'invoice_paid' // invoice paid_at <= completed_at (step 27)
  | 'departed' // completed_at present (step 30)
  | 'submitted'; // set by the Submit action (step 33)

export type FieldKey =
  | 'permit_submitted_on'
  | 'permit_followup_on'
  | 'permit_approved_on'
  | 'parts_received_on'
  | 'parts_order_no';

export interface FieldDef {
  key: FieldKey;
  label: string;
  type: 'date' | 'text';
  workbookCell: string;
}

export interface StepDef {
  /** Stable id stored in checklist_answers.step_key. */
  key: string;
  /** 1..34; sub-items share the parent's number. */
  number: number;
  /** Display label: "1", "9a", "16c". */
  label: string;
  kind: StepKind;
  /** Verbatim workbook wording (Task1 column B). */
  text: string;
  /** CALLBACK wording when it differs. */
  callbackText?: string;
  /** Locked explanatory rows under the step. */
  note?: string;
  /** Task tab column M cell that holds the Y/N/B. */
  workbookCell: string;
  scoringRole?: ScoringRole;
  autoCheck?: AutoCheck;
  fields?: readonly FieldDef[];
  /** Step 31 == Y offers "Create Call Back Checklist". */
  triggersCallback?: boolean;
}

export const CHECKLIST_STEPS: readonly StepDef[] = [
  {
    key: 's01',
    number: 1,
    label: '1',
    kind: 'step',
    workbookCell: 'M10',
    autoCheck: 'arrival',
    text: 'Arrive to appointment 30 minutes early.',
  },
  {
    key: 's02',
    number: 2,
    label: '2',
    kind: 'step',
    workbookCell: 'M11',
    scoringRole: 'service_quote',
    text: 'Greet customer and introduce yourself.',
  },
  {
    key: 's03',
    number: 3,
    label: '3',
    kind: 'step',
    workbookCell: 'M12',
    text: 'Acknowledge or confirm the reason for the appointment/service call with the customer.',
  },
  {
    key: 's04',
    number: 4,
    label: '4',
    kind: 'step',
    workbookCell: 'M13',
    text: 'Locate and assess site for issue requested.',
  },
  {
    key: 's05',
    number: 5,
    label: '5',
    kind: 'step',
    workbookCell: 'M14',
    text: 'Troubleshooting: Inspect and/or diagnose issue.',
  },
  {
    key: 's06',
    number: 6,
    label: '6',
    kind: 'step',
    workbookCell: 'M15',
    text: 'Refer to technicial doctrine for solutions.',
  },
  { key: 's06a', number: 6, label: '6a', kind: 'sub', workbookCell: 'M16', text: 'Technical Drawings' },
  { key: 's06b', number: 6, label: '6b', kind: 'sub', workbookCell: 'M17', text: 'Workflow' },
  {
    key: 's07',
    number: 7,
    label: '7',
    kind: 'step',
    workbookCell: 'M18',
    text: 'Identify issue and inform customer of issue by communcating a primary and secondary solution.',
  },
  {
    key: 's08',
    number: 8,
    label: '8',
    kind: 'step',
    workbookCell: 'M19',
    text: 'Inform customer that you will need to research the cost of the repair(s)/install/project.',
  },
  {
    key: 's09',
    number: 9,
    label: '9',
    kind: 'step',
    workbookCell: 'M20',
    text: 'Communicate the cost of the repairs(s)/project to the customer.',
  },
  {
    key: 's09a',
    number: 9,
    label: '9a',
    kind: 'sub',
    workbookCell: 'M21',
    text: 'Did customer decline service?',
  },
  {
    key: 's09b',
    number: 9,
    label: '9b',
    kind: 'sub',
    workbookCell: 'M22',
    text: 'Did customer accept cost and agreed to service?',
  },
  {
    key: 's10',
    number: 10,
    label: '10',
    kind: 'step',
    workbookCell: 'M23',
    autoCheck: 'follow_up_job',
    text: 'Secure a projected date for repair(s)/install/project preferable on a Saturday for residential customers if feasible.',
  },
  {
    key: 's11',
    number: 11,
    label: '11',
    kind: 'step',
    workbookCell: 'M24',
    autoCheck: 'deposit',
    text: 'Non-Refundable Scheduling Fee: Collect a $100 deposit for a scheduled appointment if customer is not in the PM program.',
    note: "Deposit is non-refundable as a credit if Non-PM customer cancels or isn't available for repair(s)/project.",
  },
  {
    key: 's12',
    number: 12,
    label: '12',
    kind: 'step',
    workbookCell: 'M26',
    text: 'Permit Submission Date (If Applicable):',
    fields: [
      { key: 'permit_submitted_on', label: 'Permit submission date', type: 'date', workbookCell: 'F26' },
    ],
  },
  {
    key: 's13',
    number: 13,
    label: '13',
    kind: 'step',
    workbookCell: 'M27',
    text: 'Permit Follow-Up Date (If Applicable):',
    fields: [
      { key: 'permit_followup_on', label: 'Permit follow-up date', type: 'date', workbookCell: 'F27' },
    ],
  },
  {
    key: 's14',
    number: 14,
    label: '14',
    kind: 'step',
    workbookCell: 'M28',
    text: 'Permit Approval Date (If Applicable):',
    fields: [
      { key: 'permit_approved_on', label: 'Permit approval date', type: 'date', workbookCell: 'F28' },
    ],
  },
  {
    key: 's15',
    number: 15,
    label: '15',
    kind: 'step',
    workbookCell: 'M30',
    text: 'Order Parts. If repair(s) can be made on-site on the same day of the appointment, source local parts suppliers via established business account(s).',
  },
  {
    key: 's16',
    number: 16,
    label: '16',
    kind: 'step',
    workbookCell: 'M31',
    text: "Order Parts. If repairs can't be made on-site on the same day of the appointment, order parts needed for repairs.",
  },
  {
    key: 's16a',
    number: 16,
    label: '16a',
    kind: 'sub',
    workbookCell: 'M32',
    text: 'Technical Drawings: Refer to doctrine to validate parts.',
  },
  {
    key: 's16b',
    number: 16,
    label: '16b',
    kind: 'sub',
    workbookCell: 'M33',
    text: 'Workflow: Refer to doctrine to validate install/project.',
  },
  {
    key: 's16c',
    number: 16,
    label: '16c',
    kind: 'sub',
    workbookCell: 'M34',
    text: 'Parts Received.',
    fields: [
      { key: 'parts_received_on', label: 'Parts received date', type: 'date', workbookCell: 'E34' },
      { key: 'parts_order_no', label: 'Parts order no.', type: 'text', workbookCell: 'I34' },
    ],
  },
  {
    key: 's17',
    number: 17,
    label: '17',
    kind: 'step',
    workbookCell: 'M36',
    scoringRole: 'in_progress',
    text: 'On the day of the repair(s)/project, remember safety first. Shut-off all systems, if qualified and/or authorized, that will be affected by the repair.',
  },
  {
    key: 's18',
    number: 18,
    label: '18',
    kind: 'step',
    workbookCell: 'M38',
    text: 'Removal/Installation Instructions. Review all instructions relevant to repair, in order to perform a safe quality repair/project.',
  },
  {
    key: 's19',
    number: 19,
    label: '19',
    kind: 'step',
    workbookCell: 'M39',
    text: 'Remove and install new part(s).',
  },
  {
    key: 's20',
    number: 20,
    label: '20',
    kind: 'step',
    workbookCell: 'M40',
    text: 'Perform quality check of install. Ensure all parts have been installed and sealed, if applicable, correctly.',
  },
  {
    key: 's21',
    number: 21,
    label: '21',
    kind: 'step',
    workbookCell: 'M41',
    text: 'Perform operational check of new installation. Did you perform Service Validation Testing ?',
  },
  {
    key: 's22',
    number: 22,
    label: '22',
    kind: 'step',
    workbookCell: 'M43',
    scoringRole: 'fail_ops_check',
    text: "If operational check fails, troubleshoot and make necessary corrections. If corrections can't be made within reason, update management for a course of action. Did the operational check fail? If Yes, return to Step 5 to repeat process.",
  },
  {
    key: 's23',
    number: 23,
    label: '23',
    kind: 'step',
    workbookCell: 'M44',
    scoringRole: 'fail_qaqc',
    text: 'If operational check is successful, conduct a quality check of installation. Did you conduct a QA/QC?',
  },
  {
    key: 's24',
    number: 24,
    label: '24',
    kind: 'step',
    workbookCell: 'M45',
    text: 'Request a quality check of the installation from management if time permits. Did Manager perform a QA/QC?',
  },
  {
    key: 's25',
    number: 25,
    label: '25',
    kind: 'step',
    workbookCell: 'M46',
    text: 'Once installation has been completed, inform customer of repair/installation.',
  },
  {
    key: 's26',
    number: 26,
    label: '26',
    kind: 'step',
    workbookCell: 'M47',
    scoringRole: 'fail_tool_control',
    text: 'Clean up worksite and gather all tools daily.',
  },
  {
    key: 's27',
    number: 27,
    label: '27',
    kind: 'step',
    workbookCell: 'M49',
    autoCheck: 'invoice_paid',
    text: 'Closeout repair by invoicing customer with the final cost minus the $100 deposit scheduling fee. Charge customer before departing site. Credit is only applicable to Non-PM program customers.',
  },
  {
    key: 's28',
    number: 28,
    label: '28',
    kind: 'step',
    workbookCell: 'M51',
    text: 'Once invoice has been settled with customer, ask the customer if they have any questions or concerns about the repair(s)/installation.',
  },
  {
    key: 's29',
    number: 29,
    label: '29',
    kind: 'step',
    workbookCell: 'M52',
    text: 'Ask the customer if they have additional energy projects pending and introduce the RSE PM program to customer.',
  },
  {
    key: 's29a',
    number: 29,
    label: '29a',
    kind: 'sub',
    workbookCell: 'M53',
    text: 'If yes, list the potential projects in the Notes/Remarks sections.',
  },
  {
    key: 's29b',
    number: 29,
    label: '29b',
    kind: 'sub',
    workbookCell: 'M55',
    text: "If the customer doesn't have any additional projects, thank the customer for their business and ask them to refer RSE Energy Group to others.",
  },
  {
    key: 's29c',
    number: 29,
    label: '29c',
    kind: 'sub',
    workbookCell: 'M56',
    text: 'Leave a business card or send a Thank You text message.',
  },
  {
    key: 's30',
    number: 30,
    label: '30',
    kind: 'step',
    workbookCell: 'M57',
    autoCheck: 'departed',
    text: 'Depart site.',
  },
  {
    key: 's31',
    number: 31,
    label: '31',
    kind: 'step',
    workbookCell: 'M58',
    scoringRole: 'fail_callback',
    triggersCallback: true,
    text: 'Did you incur a callback for service due to a failed installation? If Yes, refer to Call Back Checklist for service.',
  },
  {
    key: 's32',
    number: 32,
    label: '32',
    kind: 'step',
    workbookCell: 'M59',
    text: 'Follow-up with the customer one week after the project/installation, to check on the install.',
  },
  {
    key: 's33',
    number: 33,
    label: '33',
    kind: 'step',
    workbookCell: 'M60',
    autoCheck: 'submitted',
    text: 'Close appointment checklist. Sign checklist and submit to management for review. Enter B if Call Back occurred.',
    note: 'Pay Validation. Submit all checklists to Management to validate time cards prior to the end of each pay period. Failure to submit all checklists for the respective pay period will result in a 50% reduction in pay for the pay period. Please keep in mind to submit all checklists with the most accurate and updated information for the respective task(s).',
  },
  {
    key: 's34',
    number: 34,
    label: '34',
    kind: 'step',
    workbookCell: 'M64',
    scoringRole: 'completed',
    text: 'Proceed to next appointment or coordinate with other Team Members to assist with their appointments if needed.',
    callbackText: 'Return to original appointment checklist to closeout both checklist.',
  },
];

/** Header input cells on a Task tab. */
export const HEADER_CELLS = {
  customer_name: 'C3',
  project_type: 'C4',
  project_date: 'C5',
  project_location: 'C6',
  referral_project_no: 'C7',
  notes: 'E78',
} as const;

/** Values of the Project Type dropdown (Task tab C4 data validation). */
export const PROJECT_TYPES = ['HVAC', 'WATER HEATER', 'GENERATOR', 'OTHER'] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

export const STEP_KEYS: readonly string[] = CHECKLIST_STEPS.map((s) => s.key);

const stepsByKey = new Map(CHECKLIST_STEPS.map((s) => [s.key, s]));

export function getStep(key: string): StepDef | undefined {
  return stepsByKey.get(key);
}

export function isStepKey(key: string): boolean {
  return stepsByKey.has(key);
}

/** Step key that carries a scoring role; every role maps to exactly one step. */
export const STEP_KEY_BY_ROLE: Readonly<Record<ScoringRole, string>> = (() => {
  const out = {} as Record<ScoringRole, string>;
  for (const step of CHECKLIST_STEPS) {
    if (step.scoringRole) out[step.scoringRole] = step.key;
  }
  return out;
})();

/** Display text for a step on a given checklist type. */
export function stepText(step: StepDef, type: ChecklistType): string {
  return type === 'callback' && step.callbackText ? step.callbackText : step.text;
}
