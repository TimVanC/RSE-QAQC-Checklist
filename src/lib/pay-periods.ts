/**
 * Pay period generation. The cadence and anchor live in `app_settings.pay_period_rule`;
 * default is biweekly anchored on Monday 2026-07-06 (go-live) until Ron confirms otherwise
 * (docs/planning/open-questions.md, question 1).
 */
import { addDays, compareDates, diffDays, isIsoDate, type IsoDate } from './time';

export type PayPeriodCadence = 'weekly' | 'biweekly' | 'monthly';

export interface PayPeriodRule {
  cadence: PayPeriodCadence;
  /** First day of some period; every other period is derived from it. Ignored for monthly. */
  anchor: IsoDate;
}

export interface PayPeriodSpan {
  start_date: IsoDate;
  end_date: IsoDate;
  label: string;
}

export const DEFAULT_PAY_PERIOD_RULE: PayPeriodRule = { cadence: 'biweekly', anchor: '2026-07-06' };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function labelFor(start: IsoDate, end: IsoDate): string {
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  const s = `${MONTHS[sm - 1]} ${sd}`;
  const e = `${MONTHS[em - 1]} ${ed}`;
  if (sy === ey) return `${s} to ${e}, ${sy}`;
  return `${s}, ${sy} to ${e}, ${ey}`;
}

function monthStart(date: IsoDate): IsoDate {
  return `${date.slice(0, 7)}-01`;
}

function monthEnd(date: IsoDate): IsoDate {
  const [y, m] = date.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${date.slice(0, 7)}-${String(last).padStart(2, '0')}`;
}

function addMonths(date: IsoDate, n: number): IsoDate {
  const [y, m] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + n, 1));
  return dt.toISOString().slice(0, 10);
}

/** The period containing `date`. */
export function periodForDate(rule: PayPeriodRule, date: IsoDate): PayPeriodSpan {
  if (!isIsoDate(date)) throw new Error(`invalid date: ${date}`);
  if (rule.cadence === 'monthly') {
    const start = monthStart(date);
    const end = monthEnd(date);
    return { start_date: start, end_date: end, label: labelFor(start, end) };
  }
  if (!isIsoDate(rule.anchor)) throw new Error(`invalid anchor: ${rule.anchor}`);
  const length = rule.cadence === 'weekly' ? 7 : 14;
  const offset = diffDays(date, rule.anchor);
  const index = Math.floor(offset / length);
  const start = addDays(rule.anchor, index * length);
  const end = addDays(start, length - 1);
  return { start_date: start, end_date: end, label: labelFor(start, end) };
}

/** Every period that overlaps [from, to], in order. */
export function generatePayPeriods(rule: PayPeriodRule, from: IsoDate, to: IsoDate): PayPeriodSpan[] {
  if (compareDates(from, to) > 0) return [];
  const out: PayPeriodSpan[] = [];
  let cursor = periodForDate(rule, from);
  while (compareDates(cursor.start_date, to) <= 0) {
    out.push(cursor);
    const nextStart =
      rule.cadence === 'monthly' ? addMonths(cursor.start_date, 1) : addDays(cursor.end_date, 1);
    cursor = periodForDate(rule, nextStart);
  }
  return out;
}
