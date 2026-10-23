/** Human-readable names for the workbook's four task failure flags (C86..C89). */
export interface FailureFlags {
  failOpsCheck?: number | null;
  failQaqc?: number | null;
  failToolControl?: number | null;
  failCallback?: number | null;
}

export const FAILURE_LABELS = {
  failOpsCheck: 'Ops check failed',
  failQaqc: 'No QA/QC',
  failToolControl: 'Tools not gathered',
  failCallback: 'Call back',
} as const;

/** Labels of the flags that are set, in workbook order. Empty when the task is clean. */
export function failureLabels(flags: FailureFlags | null | undefined): string[] {
  if (!flags) return [];
  const out: string[] = [];
  if (flags.failOpsCheck) out.push(FAILURE_LABELS.failOpsCheck);
  if (flags.failQaqc) out.push(FAILURE_LABELS.failQaqc);
  if (flags.failToolControl) out.push(FAILURE_LABELS.failToolControl);
  if (flags.failCallback) out.push(FAILURE_LABELS.failCallback);
  return out;
}
