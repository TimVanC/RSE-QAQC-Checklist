import { describe, expect, it } from 'vitest';
import { addDays, appDayRange, diffDays, formatApp, isIsoDate, toAppDate } from '@/src/lib/time';

const NY = 'America/New_York';

describe('toAppDate', () => {
  it('uses the New York calendar date, not UTC', () => {
    // 03:30 UTC on Jul 7 is 23:30 EDT on Jul 6
    expect(toAppDate(new Date('2026-07-07T03:30:00Z'), NY)).toBe('2026-07-06');
    expect(toAppDate(new Date('2026-07-07T04:30:00Z'), NY)).toBe('2026-07-07');
  });

  it('handles standard time in winter', () => {
    // 04:30 UTC on Jan 10 is 23:30 EST on Jan 9
    expect(toAppDate(new Date('2026-01-10T04:30:00Z'), NY)).toBe('2026-01-09');
  });
});

describe('appDayRange', () => {
  it('returns UTC instants for the New York day', () => {
    const { start, end } = appDayRange('2026-07-06', NY);
    expect(start.toISOString()).toBe('2026-07-06T04:00:00.000Z');
    expect(end.toISOString()).toBe('2026-07-07T04:00:00.000Z');
  });

  it('spans 23 hours on the spring-forward day', () => {
    const { start, end } = appDayRange('2026-03-08', NY);
    expect((end.getTime() - start.getTime()) / 3_600_000).toBe(23);
  });

  it('rejects malformed dates', () => {
    expect(() => appDayRange('2026-7-6', NY)).toThrow();
  });
});

describe('calendar helpers', () => {
  it('adds and diffs days across month and year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(diffDays('2026-07-20', '2026-07-06')).toBe(14);
    expect(diffDays('2026-07-06', '2026-07-20')).toBe(-14);
  });

  it('validates ISO dates', () => {
    expect(isIsoDate('2026-07-06')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('07/06/2026')).toBe(false);
    expect(isIsoDate(null)).toBe(false);
  });

  it('formats instants in New York time', () => {
    expect(formatApp('2026-07-06T13:05:00Z', 'h:mm a', NY)).toBe('9:05 AM');
    expect(formatApp(null)).toBe('');
    expect(formatApp('not a date')).toBe('');
  });
});
