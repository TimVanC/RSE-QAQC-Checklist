import 'server-only';
import { asc, eq } from 'drizzle-orm';
import { getDb } from '@/src/db';
import { payPeriods, type PayPeriod } from '@/src/db/schema/checklists';
import { appSettings } from '@/src/db/schema/system';
import {
  DEFAULT_PAY_PERIOD_RULE,
  periodForDate,
  type PayPeriodCadence,
  type PayPeriodRule,
  type PayPeriodSpan,
} from '@/src/lib/pay-periods';
import { addDays, compareDates, isIsoDate, todayAppDate, type IsoDate } from '@/src/lib/time';

export const PAY_PERIOD_RULE_KEY = 'pay_period_rule';

const CADENCES: readonly PayPeriodCadence[] = ['weekly', 'biweekly', 'monthly'];

/** A period the reports run over: a stored `pay_periods` row (with `id`) or one computed from the rule. */
export interface ResolvedPeriod extends PayPeriodSpan {
  id?: string;
}

/** Everything the period selector needs: the selected period, its neighbours and the options. */
export interface PeriodNavigation {
  period: ResolvedPeriod;
  prev: ResolvedPeriod;
  next: ResolvedPeriod;
  /** Start date of the period containing today (NJ). */
  currentStart: IsoDate;
  /** Stored periods plus the current and the selected one when not stored; newest first. */
  options: ResolvedPeriod[];
}

/** `app_settings.pay_period_rule` is `{cadence, anchor}`; anything malformed falls back to the default. */
export function parsePayPeriodRule(value: unknown): PayPeriodRule {
  if (!value || typeof value !== 'object') return DEFAULT_PAY_PERIOD_RULE;
  const { cadence, anchor } = value as Record<string, unknown>;
  if (!CADENCES.includes(cadence as PayPeriodCadence) || !isIsoDate(anchor)) {
    return DEFAULT_PAY_PERIOD_RULE;
  }
  return { cadence: cadence as PayPeriodCadence, anchor };
}

function toResolved(
  row: Pick<PayPeriod, 'id' | 'label' | 'startDate' | 'endDate'>,
): ResolvedPeriod {
  return { id: row.id, label: row.label, start_date: row.startDate, end_date: row.endDate };
}

/** The stored period containing `date`, else the one computed from the rule. */
export function periodContaining(
  date: IsoDate,
  stored: readonly ResolvedPeriod[],
  rule: PayPeriodRule,
): ResolvedPeriod {
  const hit = stored.find(
    (p) => compareDates(p.start_date, date) <= 0 && compareDates(date, p.end_date) <= 0,
  );
  return hit ?? periodForDate(rule, date);
}

/**
 * Pure resolver behind `resolvePeriod`. `param` matching a stored start date selects that period;
 * any other ISO date selects the period containing it (stored first, then computed from the rule);
 * anything else selects the period containing `today`.
 */
export function resolvePeriodFrom(
  param: string | undefined,
  stored: readonly ResolvedPeriod[],
  rule: PayPeriodRule,
  today: IsoDate,
): ResolvedPeriod {
  if (isIsoDate(param)) {
    const exact = stored.find((p) => p.start_date === param);
    if (exact) return exact;
    return periodContaining(param, stored, rule);
  }
  return periodContaining(today, stored, rule);
}

/** Pure: neighbours and select options for a resolved period. */
export function buildPeriodNavigation(
  period: ResolvedPeriod,
  stored: readonly ResolvedPeriod[],
  rule: PayPeriodRule,
  today: IsoDate,
): PeriodNavigation {
  const current = periodContaining(today, stored, rule);
  const byStart = new Map<IsoDate, ResolvedPeriod>();
  for (const p of [...stored, current, period]) {
    if (!byStart.has(p.start_date)) byStart.set(p.start_date, p);
  }
  const options = [...byStart.values()].sort((a, b) => compareDates(b.start_date, a.start_date));
  return {
    period,
    prev: periodContaining(addDays(period.start_date, -1), stored, rule),
    next: periodContaining(addDays(period.end_date, 1), stored, rule),
    currentStart: current.start_date,
    options,
  };
}

export async function getPayPeriodRule(): Promise<PayPeriodRule> {
  const [row] = await getDb()
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, PAY_PERIOD_RULE_KEY))
    .limit(1);
  return parsePayPeriodRule(row?.value);
}

/** Stored pay periods, oldest first. */
export async function listPayPeriods(): Promise<PayPeriod[]> {
  return getDb().select().from(payPeriods).orderBy(asc(payPeriods.startDate));
}

async function loadStoredAndRule(): Promise<{ stored: ResolvedPeriod[]; rule: PayPeriodRule }> {
  const [rows, rule] = await Promise.all([listPayPeriods(), getPayPeriodRule()]);
  return { stored: rows.map(toResolved), rule };
}

/** The period a report page shows for its `?period=` search param (see `resolvePeriodFrom`). */
export async function resolvePeriod(param?: string): Promise<ResolvedPeriod> {
  const { stored, rule } = await loadStoredAndRule();
  return resolvePeriodFrom(param, stored, rule, todayAppDate());
}

/** `resolvePeriod` plus what the period selector needs, from the same two reads. */
export async function getPeriodNavigation(param?: string): Promise<PeriodNavigation> {
  const { stored, rule } = await loadStoredAndRule();
  const today = todayAppDate();
  const period = resolvePeriodFrom(param, stored, rule, today);
  return buildPeriodNavigation(period, stored, rule, today);
}
