import type { ProjectType } from '@/src/config/checklist-steps';
import { saveField, type ActionResult } from '@/src/server/actions/checklists';

export const TEXT_FIELDS = [
  'customer_name',
  'project_location',
  'referral_project_no',
  'parts_order_no',
  'notes',
] as const;

export const DATE_FIELDS = [
  'project_date',
  'permit_submitted_on',
  'permit_followup_on',
  'permit_approved_on',
  'parts_received_on',
  'call_date',
] as const;

export type TextFieldName = (typeof TEXT_FIELDS)[number];
export type DateFieldName = (typeof DATE_FIELDS)[number];
export type FieldName = 'project_type' | TextFieldName | DateFieldName;

function isTextField(field: FieldName): field is TextFieldName {
  return (TEXT_FIELDS as readonly string[]).includes(field);
}

/** Call the `saveField` server action with the right shape for each field. */
export function callSaveField(
  checklistId: string,
  field: FieldName,
  value: string | null,
): Promise<ActionResult> {
  if (field === 'project_type') {
    return saveField({ checklistId, field, value: (value || null) as ProjectType | null });
  }
  if (isTextField(field)) {
    return saveField({ checklistId, field, value: value ?? '' });
  }
  return saveField({ checklistId, field, value: value ?? '' });
}
