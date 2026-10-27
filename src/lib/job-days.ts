/**
 * Which calendar days (America/New_York) a job runs on, for multi-day jobs in the call queue.
 * A job's days are the union of its appointments' day spans; without appointments, the job's own
 * scheduled start-to-end span. Spans are capped so a bad end date cannot flood the queue.
 * Pure, unit tested in tests/lib/job-days.test.ts.
 */
import { addDays, compareDates, diffDays, toAppDate, type IsoDate } from './time';

export interface DaySpan {
  startAt: Date | null;
  endAt: Date | null;
}

/** Longest span a single appointment or job schedule is allowed to cover. */
export const MAX_SPAN_DAYS = 14;

/** Every day from the start to the end instant (inclusive), capped at MAX_SPAN_DAYS. */
export function spanDays(span: DaySpan, tz?: string): IsoDate[] {
  if (!span.startAt) return [];
  const first = toAppDate(span.startAt, tz);
  const lastRaw = span.endAt && span.endAt > span.startAt ? toAppDate(span.endAt, tz) : first;
  const length = Math.min(diffDays(lastRaw, first), MAX_SPAN_DAYS - 1);
  const out: IsoDate[] = [];
  for (let i = 0; i <= length; i += 1) out.push(addDays(first, i));
  return out;
}

/** Sorted distinct days a job runs on. Appointments win over the job's own schedule when present. */
export function jobDays(job: DaySpan, appointments: readonly DaySpan[], tz?: string): IsoDate[] {
  const spans = appointments.filter((a) => a.startAt).length > 0 ? appointments : [job];
  const set = new Set<IsoDate>();
  for (const span of spans) for (const day of spanDays(span, tz)) set.add(day);
  return [...set].sort(compareDates);
}

export interface JobDayPosition {
  /** 1-based position of `date` among the job's days. */
  index: number;
  count: number;
}

/** "Day 2 of 3" for a date, or null when the job runs on a single day (or not on that date). */
export function jobDayPosition(days: readonly IsoDate[], date: IsoDate): JobDayPosition | null {
  if (days.length < 2) return null;
  const index = days.indexOf(date);
  if (index < 0) return null;
  return { index: index + 1, count: days.length };
}
