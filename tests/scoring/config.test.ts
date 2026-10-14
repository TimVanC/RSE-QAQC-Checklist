import { describe, expect, it } from 'vitest';
import {
  CHECKLIST_STEPS,
  HEADER_CELLS,
  PROJECT_TYPES,
  STEP_KEY_BY_ROLE,
  stepText,
} from '@/src/config/checklist-steps';
import fixtures from './fixtures/checklists.json';

/** Every unlocked column-M cell on the Task1 tab, from scripts/workbook/inputs.py. */
const UNLOCKED_ANSWER_CELLS = [
  'M10', 'M11', 'M12', 'M13', 'M14', 'M15', 'M16', 'M17', 'M18', 'M19', 'M20', 'M21', 'M22', 'M23', 'M24',
  'M26', 'M27', 'M28', 'M30', 'M31', 'M32', 'M33', 'M34', 'M36', 'M38', 'M39', 'M40', 'M41', 'M43', 'M44',
  'M45', 'M46', 'M47', 'M49', 'M51', 'M52', 'M53', 'M55', 'M56', 'M57', 'M58', 'M59', 'M60', 'M64',
];

describe('checklist-steps config matches the workbook', () => {
  it('defines 44 steps with unique keys', () => {
    expect(CHECKLIST_STEPS.length).toBe(44);
    expect(new Set(CHECKLIST_STEPS.map((s) => s.key)).size).toBe(44);
  });

  it('maps exactly the unlocked answer cells, in workbook order', () => {
    expect(CHECKLIST_STEPS.map((s) => s.workbookCell)).toEqual(UNLOCKED_ANSWER_CELLS);
  });

  it('agrees with the fixture generator cell map', () => {
    const fromConfig = Object.fromEntries(CHECKLIST_STEPS.map((s) => [s.key, s.workbookCell]));
    expect(fromConfig).toEqual(fixtures.meta.cells);
  });

  it('numbers steps 1..34 and labels sub-items with letters', () => {
    const mains = CHECKLIST_STEPS.filter((s) => s.kind === 'step');
    expect(mains.map((s) => s.number)).toEqual(Array.from({ length: 34 }, (_, i) => i + 1));
    expect(mains.every((s) => s.label === String(s.number))).toBe(true);
    const subs = CHECKLIST_STEPS.filter((s) => s.kind === 'sub');
    expect(subs.map((s) => s.label)).toEqual(['6a', '6b', '9a', '9b', '16a', '16b', '16c', '29a', '29b', '29c']);
  });

  it('assigns the seven scoring roles to the formula cells', () => {
    const cellOf = (key: string) => CHECKLIST_STEPS.find((s) => s.key === key)!.workbookCell;
    expect(cellOf(STEP_KEY_BY_ROLE.service_quote)).toBe('M11');
    expect(cellOf(STEP_KEY_BY_ROLE.in_progress)).toBe('M36');
    expect(cellOf(STEP_KEY_BY_ROLE.completed)).toBe('M64');
    expect(cellOf(STEP_KEY_BY_ROLE.fail_ops_check)).toBe('M43');
    expect(cellOf(STEP_KEY_BY_ROLE.fail_qaqc)).toBe('M44');
    expect(cellOf(STEP_KEY_BY_ROLE.fail_tool_control)).toBe('M47');
    expect(cellOf(STEP_KEY_BY_ROLE.fail_callback)).toBe('M58');
    expect(CHECKLIST_STEPS.filter((s) => s.scoringRole).length).toBe(7);
  });

  it('keeps the date and text fields on the right cells', () => {
    const fields = CHECKLIST_STEPS.flatMap((s) => s.fields ?? []);
    expect(Object.fromEntries(fields.map((f) => [f.key, f.workbookCell]))).toEqual({
      permit_submitted_on: 'F26',
      permit_followup_on: 'F27',
      permit_approved_on: 'F28',
      parts_received_on: 'E34',
      parts_order_no: 'I34',
    });
  });

  it('only step 34 differs on the callback checklist', () => {
    const differing = CHECKLIST_STEPS.filter((s) => stepText(s, 'callback') !== stepText(s, 'task'));
    expect(differing.map((s) => s.key)).toEqual(['s34']);
    expect(stepText(differing[0], 'callback')).toBe(
      'Return to original appointment checklist to closeout both checklist.',
    );
  });

  it('exposes header cells and project types as in the workbook', () => {
    expect(HEADER_CELLS).toEqual({
      customer_name: 'C3',
      project_type: 'C4',
      project_date: 'C5',
      project_location: 'C6',
      referral_project_no: 'C7',
      notes: 'E78',
    });
    expect(PROJECT_TYPES).toEqual(['HVAC', 'WATER HEATER', 'GENERATOR', 'OTHER']);
  });
});
