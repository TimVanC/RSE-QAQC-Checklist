/**
 * Time helpers. Every "day" in the app (call queue date, pay periods, project dates) is a calendar
 * date in America/New_York, regardless of where the caller sits (the call team is in the Philippines).
 */
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

export const APP_TIMEZONE = process.env.APP_TIMEZONE || 'America/New_York';

/** ISO calendar date, e.g. "2026-07-06". */
export type IsoDate = string;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== 'string' || !ISO_DATE_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Calendar date of an instant in the app timezone. */
export function toAppDate(instant: Date, tz: string = APP_TIMEZONE): IsoDate {
  return formatInTimeZone(instant, tz, 'yyyy-MM-dd');
}

export function todayAppDate(now: Date = new Date(), tz: string = APP_TIMEZONE): IsoDate {
  return toAppDate(now, tz);
}

/** UTC instants for [start of day, start of next day) of a calendar date in the app timezone. */
export function appDayRange(date: IsoDate, tz: string = APP_TIMEZONE): { start: Date; end: Date } {
  if (!isIsoDate(date)) throw new Error(`invalid date: ${date}`);
  const start = fromZonedTime(`${date}T00:00:00`, tz);
  const end = fromZonedTime(`${addDays(date, 1)}T00:00:00`, tz);
  return { start, end };
}

/** Format an instant for display in the app timezone. */
export function formatApp(instant: Date | string | null | undefined, fmt = 'MMM d, yyyy h:mm a', tz: string = APP_TIMEZONE) {
  if (!instant) return '';
  const d = typeof instant === 'string' ? new Date(instant) : instant;
  if (Number.isNaN(d.getTime())) return '';
  return formatInTimeZone(d, tz, fmt);
}

// ---- calendar-date arithmetic (no timezone involved) ---------------------------------------

export function addDays(date: IsoDate, days: number): IsoDate {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function diffDays(a: IsoDate, b: IsoDate): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86_400_000);
}

export function compareDates(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
