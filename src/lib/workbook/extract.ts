/**
 * Turn the cells of one Task / CALLBACK tab into checklist answers and header fields, using the
 * same cell map the app was built from (src/config/checklist-steps.ts). Pure; the server action
 * decides what to write.
 */
import {
  CHECKLIST_STEPS,
  HEADER_CELLS,
  PROJECT_TYPES,
  type AnswerValue,
  type ChecklistType,
  type ProjectType,
} from '@/src/config/checklist-steps';
import { cellToIsoDate, cellToText, type CellMap, type SheetCells } from './cells';

export interface ExtractedFields {
  customer_name?: string;
  project_type?: ProjectType;
  project_date?: string;
  project_location?: string;
  referral_project_no?: string;
  notes?: string;
  permit_submitted_on?: string;
  permit_followup_on?: string;
  permit_approved_on?: string;
  parts_received_on?: string;
  parts_order_no?: string;
}

export interface ExtractedChecklist {
  /** Step key -> Y/N/B for every answered cell. Empty cells are left out, never nulled. */
  answers: Record<string, AnswerValue>;
  fields: ExtractedFields;
  /** Cells that held something we could not read, with the raw value, for the summary. */
  problems: string[];
}

const DATE_FIELDS = new Set([
  'project_date',
  'permit_submitted_on',
  'permit_followup_on',
  'permit_approved_on',
  'parts_received_on',
]);

export function normalizeAnswerCell(value: unknown): AnswerValue | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim().toUpperCase();
  if (s === 'Y' || s === 'YES') return 'Y';
  if (s === 'N' || s === 'NO') return 'N';
  if (s === 'B') return 'B';
  return null;
}

function projectType(value: unknown): ProjectType | null {
  const s = cellToText(value as never)
    ?.toUpperCase()
    .replace(/\s+/g, ' ');
  if (!s) return null;
  return (PROJECT_TYPES as readonly string[]).includes(s) ? (s as ProjectType) : null;
}

export function extractChecklist(cells: CellMap): ExtractedChecklist {
  const answers: Record<string, AnswerValue> = {};
  const fields: ExtractedFields = {};
  const problems: string[] = [];

  for (const step of CHECKLIST_STEPS) {
    const raw = cells.get(step.workbookCell) ?? null;
    if (raw !== null && cellToText(raw) !== null) {
      const value = normalizeAnswerCell(raw);
      if (value) answers[step.key] = value;
      else {
        problems.push(
          `${step.workbookCell} (step ${step.label}): "${cellToText(raw)}" is not Y, N or B`,
        );
      }
    }
    for (const field of step.fields ?? []) {
      const fraw = cells.get(field.workbookCell) ?? null;
      if (fraw === null || cellToText(fraw) === null) continue;
      if (field.type === 'date') {
        const d = cellToIsoDate(fraw);
        if (d) fields[field.key] = d;
        else {
          problems.push(
            `${field.workbookCell} (${field.label}): "${cellToText(fraw)}" is not a date`,
          );
        }
      } else {
        fields[field.key] = cellToText(fraw) ?? undefined;
      }
    }
  }

  for (const [key, cell] of Object.entries(HEADER_CELLS) as [keyof typeof HEADER_CELLS, string][]) {
    const raw = cells.get(cell) ?? null;
    if (raw === null || cellToText(raw) === null) continue;
    if (key === 'project_type') {
      const t = projectType(raw);
      if (t) fields.project_type = t;
      else
        problems.push(
          `${cell} (Project Type): "${cellToText(raw)}" is not one of ${PROJECT_TYPES.join(', ')}`,
        );
    } else if (DATE_FIELDS.has(key)) {
      const d = cellToIsoDate(raw);
      if (d) fields[key as 'project_date'] = d;
      else problems.push(`${cell} (Project Date): "${cellToText(raw)}" is not a date`);
    } else {
      fields[key as 'customer_name' | 'project_location' | 'referral_project_no' | 'notes'] =
        cellToText(raw) ?? undefined;
    }
  }

  return { answers, fields, problems };
}

export interface SheetSummary {
  name: string;
  customerName: string | null;
  projectDate: string | null;
  answered: number;
}

export function summarizeSheet(sheet: SheetCells): SheetSummary {
  const { answers, fields } = extractChecklist(sheet.cells);
  return {
    name: sheet.name,
    customerName: fields.customer_name ?? null,
    projectDate: fields.project_date ?? null,
    answered: Object.keys(answers).length,
  };
}

/** Tabs of the right kind (Task* for task checklists, CALLBACK* for call backs) that hold data. */
export function candidateSheets(
  sheets: readonly SheetCells[],
  type: ChecklistType,
): SheetSummary[] {
  const prefix = type === 'callback' ? /^callback/i : /^task/i;
  const typed = sheets.filter((s) => prefix.test(s.name.trim()));
  const pool = typed.length > 0 ? typed : sheets;
  return pool.map(summarizeSheet).filter((s) => s.answered > 0 || s.customerName);
}
