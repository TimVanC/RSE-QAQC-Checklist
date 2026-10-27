import { describe, expect, it } from 'vitest';
import { jobDayPosition, jobDays, spanDays } from '@/src/lib/job-days';

// 9am–5pm New Jersey (EDT, UTC-4) on the given day.
const nj = (day: string, hour: number) =>
  new Date(new Date(`${day}T00:00:00Z`).getTime() + (hour + 4) * 3_600_000);

describe('spanDays', () => {
  it('is one day for a same-day span and for a missing end', () => {
    expect(spanDays({ startAt: nj('2026-10-13', 9), endAt: nj('2026-10-13', 17) })).toEqual([
      '2026-10-13',
    ]);
    expect(spanDays({ startAt: nj('2026-10-13', 9), endAt: null })).toEqual(['2026-10-13']);
    expect(spanDays({ startAt: null, endAt: null })).toEqual([]);
  });

  it('lists every New Jersey day of a multi-day span', () => {
    expect(spanDays({ startAt: nj('2026-10-13', 9), endAt: nj('2026-10-15', 17) })).toEqual([
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
    ]);
  });

  it('uses the New Jersey day, not UTC, for evening starts', () => {
    // 10pm NJ on the 13th is 2am UTC on the 14th.
    expect(spanDays({ startAt: nj('2026-10-13', 22), endAt: nj('2026-10-13', 23) })).toEqual([
      '2026-10-13',
    ]);
  });

  it('caps runaway spans', () => {
    const days = spanDays({ startAt: nj('2026-10-01', 9), endAt: nj('2026-12-01', 9) });
    expect(days).toHaveLength(14);
  });
});

describe('jobDays', () => {
  const job = { startAt: nj('2026-10-13', 9), endAt: nj('2026-10-13', 17) };

  it('falls back to the job schedule without appointments', () => {
    expect(jobDays(job, [])).toEqual(['2026-10-13']);
    expect(jobDays(job, [{ startAt: null, endAt: null }])).toEqual(['2026-10-13']);
  });

  it('unions appointment days, sorted and distinct', () => {
    const days = jobDays(job, [
      { startAt: nj('2026-10-15', 9), endAt: nj('2026-10-15', 12) },
      { startAt: nj('2026-10-13', 9), endAt: nj('2026-10-13', 17) },
      { startAt: nj('2026-10-13', 13), endAt: nj('2026-10-13', 17) },
    ]);
    expect(days).toEqual(['2026-10-13', '2026-10-15']);
  });
});

describe('jobDayPosition', () => {
  it('is null for single-day jobs and days the job does not run', () => {
    expect(jobDayPosition(['2026-10-13'], '2026-10-13')).toBeNull();
    expect(jobDayPosition(['2026-10-13', '2026-10-14'], '2026-10-15')).toBeNull();
  });

  it('numbers the days', () => {
    expect(jobDayPosition(['2026-10-13', '2026-10-15'], '2026-10-15')).toEqual({
      index: 2,
      count: 2,
    });
  });
});
