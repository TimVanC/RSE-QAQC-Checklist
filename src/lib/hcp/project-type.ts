import type { ProjectType } from '@/src/config/checklist-steps';

/**
 * Keyword rules that map a Housecall Pro job type / tags / description to the workbook's
 * Project Type dropdown. Order matters: the first matching rule wins. Returns null when nothing
 * matches so the caller is prompted instead of silently getting "OTHER".
 * (Open question 4: Ron may supply exact job-type names; these rules then move to app_settings.)
 */
export interface ProjectTypeRule {
  type: ProjectType;
  pattern: RegExp;
}

export const DEFAULT_PROJECT_TYPE_RULES: readonly ProjectTypeRule[] = [
  { type: 'GENERATOR', pattern: /\bgenerat(or|ors)\b|\bgenerac\b|\bkohler\b/i },
  { type: 'WATER HEATER', pattern: /water\s*heater|\btankless\b|\bwh\b|hot\s*water/i },
  {
    type: 'HVAC',
    pattern:
      /\bhvac\b|\ba\/?c\b|air\s*cond|\bfurnace\b|heat\s*pump|\bboiler\b|mini.?split|\bductless\b|\bcooling\b|\bheating\b|\bcondenser\b|\bthermostat\b|\bduct/i,
  },
];

export interface ProjectTypeInput {
  jobTypeName?: string | null;
  tags?: readonly string[] | null;
  description?: string | null;
}

export function inferProjectType(
  input: ProjectTypeInput,
  rules: readonly ProjectTypeRule[] = DEFAULT_PROJECT_TYPE_RULES,
): ProjectType | null {
  const sources = [input.jobTypeName ?? '', ...(input.tags ?? []), input.description ?? ''];
  for (const source of sources) {
    if (!source) continue;
    for (const rule of rules) {
      if (rule.pattern.test(source)) return rule.type;
    }
  }
  return null;
}
