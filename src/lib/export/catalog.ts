/**
 * What the admin export offers: dataset names, the text shown on the export page, and file names.
 * Pure (no database access) so the page, the route and the tests share one list.
 */
import { CHECKLIST_STEPS } from '@/src/config/checklist-steps';

export const EXPORT_DATASETS = [
  'checklists',
  'answers',
  'jobs',
  'technicians',
  'pay_periods',
  'users',
  'audit_log',
] as const;

export type ExportDataset = (typeof EXPORT_DATASETS)[number];
export type ExportFormat = 'csv' | 'json';

export function isExportDataset(value: unknown): value is ExportDataset {
  return typeof value === 'string' && (EXPORT_DATASETS as readonly string[]).includes(value);
}

export function isExportFormat(value: unknown): value is ExportFormat {
  return value === 'csv' || value === 'json';
}

export interface DatasetInfo {
  title: string;
  description: string;
}

export const DATASET_INFO: Record<ExportDataset, DatasetInfo> = {
  checklists: {
    title: 'Checklists',
    description:
      'One row per checklist, task and callback: job, technician, header fields, permit and parts dates, ' +
      'submit and reopen details, and the stored score columns.',
  },
  answers: {
    title: 'Answers',
    description:
      `One row per checklist and step (${CHECKLIST_STEPS.length} per checklist, blanks included): the step wording, ` +
      'workbook cell, Y/N/B value, who answered, and the Housecall Pro auto-check suggestion and evidence.',
  },
  jobs: {
    title: 'Jobs',
    description:
      'Housecall Pro jobs held in the app, with schedule, status, amounts and assigned technicians. ' +
      'The raw Housecall Pro payloads are not included.',
  },
  technicians: {
    title: 'Technicians',
    description: 'Housecall Pro employees and whether each one appears in the call queue.',
  },
  pay_periods: {
    title: 'Pay periods',
    description: 'Pay period labels with their start and end dates.',
  },
  users: {
    title: 'Users',
    description:
      'Invited app users: email, name, role, active flag and last sign-in. No sign-in credentials.',
  },
  audit_log: {
    title: 'Audit log',
    description:
      'Every recorded change: who, when, what, with the before and after values as JSON.',
  },
};

/** `rse-qaqc-<dataset or "all">-<YYYY-MM-DD>.<csv|json>` */
export function exportFilename(
  name: ExportDataset | 'all',
  format: ExportFormat,
  isoDate: string,
): string {
  return `rse-qaqc-${name}-${isoDate}.${format}`;
}
