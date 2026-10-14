import { describe, expect, it } from 'vitest';
import { DEFAULT_PAY_PERIOD_RULE, generatePayPeriods, periodForDate } from '@/src/lib/pay-periods';

describe('periodForDate', () => {
  it('finds the biweekly period containing a date, anchored on go-live', () => {
    expect(periodForDate(DEFAULT_PAY_PERIOD_RULE, '2026-07-06')).toEqual({
      start_date: '2026-07-06',
      end_date: '2026-07-19',
      label: 'Jul 6 to Jul 19, 2026',
    });
    expect(periodForDate(DEFAULT_PAY_PERIOD_RULE, '2026-07-19').start_date).toBe('2026-07-06');
    expect(periodForDate(DEFAULT_PAY_PERIOD_RULE, '2026-07-20').start_date).toBe('2026-07-20');
  });

  it('works before the anchor', () => {
    expect(periodForDate(DEFAULT_PAY_PERIOD_RULE, '2026-07-05')).toEqual({
      start_date: '2026-06-22',
      end_date: '2026-07-05',
      label: 'Jun 22 to Jul 5, 2026',
    });
  });

  it('supports weekly and monthly cadences', () => {
    expect(periodForDate({ cadence: 'weekly', anchor: '2026-07-06' }, '2026-07-14')).toMatchObject({
      start_date: '2026-07-13',
      end_date: '2026-07-19',
    });
    expect(periodForDate({ cadence: 'monthly', anchor: '2026-07-06' }, '2026-02-10')).toEqual({
      start_date: '2026-02-01',
      end_date: '2026-02-28',
      label: 'Feb 1 to Feb 28, 2026',
    });
  });

  it('labels periods that cross a year boundary', () => {
    // 2026-12-21 is 168 days (12 periods) after the 2026-07-06 anchor
    expect(periodForDate(DEFAULT_PAY_PERIOD_RULE, '2026-12-30').label).toBe('Dec 21, 2026 to Jan 3, 2027');
  });
});

describe('generatePayPeriods', () => {
  it('lists every period overlapping a range, in order', () => {
    const periods = generatePayPeriods(DEFAULT_PAY_PERIOD_RULE, '2026-07-10', '2026-08-20');
    expect(periods.map((p) => p.start_date)).toEqual(['2026-07-06', '2026-07-20', '2026-08-03', '2026-08-17']);
    expect(periods.at(-1)?.end_date).toBe('2026-08-30');
  });

  it('handles monthly ranges', () => {
    const periods = generatePayPeriods({ cadence: 'monthly', anchor: '2026-01-01' }, '2026-11-15', '2027-01-02');
    expect(periods.map((p) => p.start_date)).toEqual(['2026-11-01', '2026-12-01', '2027-01-01']);
  });

  it('returns nothing for an inverted range', () => {
    expect(generatePayPeriods(DEFAULT_PAY_PERIOD_RULE, '2026-08-01', '2026-07-01')).toEqual([]);
  });
});
