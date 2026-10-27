import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { ChecklistStatus } from '@/src/db/schema/enums';
import { DEFAULT_PAY_PERIOD_RULE } from '@/src/lib/pay-periods';
import {
  buildPeriodNavigation,
  parsePayPeriodRule,
  resolvePeriodFrom,
  type ResolvedPeriod,
} from '@/src/server/queries/pay-periods';
import {
  buildTracker,
  countTrackerJobs,
  trackerStatus,
  type TrackerRow,
  type TrackerTechnician,
} from '@/src/server/queries/tracker';

const TECHS: TrackerTechnician[] = [
  { id: 't-marcus', firstName: 'Marcus', lastName: 'Rivera', colorHex: '#2563eb' },
  { id: 't-dana', firstName: 'Dana', lastName: 'Okafor', colorHex: null },
  { id: 't-luis', firstName: 'Luis', lastName: 'Ferreira', colorHex: null },
];

function row(
  technicianId: string,
  hcpJobId: string,
  day: number,
  checklistStatus: ChecklistStatus | null,
  extra: Partial<TrackerRow> = {},
): TrackerRow {
  return {
    technicianId,
    hcpJobId,
    invoiceNumber: null,
    customerName: `Customer ${hcpJobId}`,
    jobTypeName: 'HVAC Service Call',
    scheduledStart: new Date(Date.UTC(2026, 9, day, 14)),
    checklistId: checklistStatus ? `c-${hcpJobId}` : null,
    checklistStatus,
    callbackCount: 0,
    ...extra,
  };
}

describe('trackerStatus', () => {
  it('treats a missing or not-started checklist as missing', () => {
    expect(trackerStatus(null)).toBe('missing');
    expect(trackerStatus(undefined)).toBe('missing');
    expect(trackerStatus('not_started')).toBe('missing');
    expect(trackerStatus('in_progress')).toBe('in_progress');
    expect(trackerStatus('submitted')).toBe('submitted');
  });

  it('reports not reached when the last call attempt failed and nothing changed since', () => {
    const at = new Date('2026-10-27T01:00:00Z');
    const noAnswer = { outcome: 'no_answer' as const, at, note: null, byName: null };
    expect(trackerStatus(null, noAnswer)).toBe('not_reached');
    expect(trackerStatus('in_progress', noAnswer, new Date('2026-10-27T00:00:00Z'))).toBe(
      'not_reached',
    );
    expect(trackerStatus('in_progress', noAnswer, new Date('2026-10-27T02:00:00Z'))).toBe(
      'in_progress',
    );
    expect(trackerStatus('submitted', noAnswer)).toBe('submitted');
    expect(trackerStatus(null, { ...noAnswer, outcome: 'reached' })).toBe('missing');
  });
});

describe('countTrackerJobs', () => {
  it('counts each status once', () => {
    expect(
      countTrackerJobs([
        { status: 'submitted' },
        { status: 'submitted' },
        { status: 'in_progress' },
        { status: 'missing' },
      ]),
    ).toEqual({ jobs: 4, submitted: 2, inProgress: 1, notReached: 0, missing: 1 });
    expect(countTrackerJobs([])).toEqual({
      jobs: 0,
      submitted: 0,
      inProgress: 0,
      notReached: 0,
      missing: 0,
    });
  });
});

describe('buildTracker', () => {
  const rows: TrackerRow[] = [
    row('t-marcus', 'job-3', 14, 'submitted', { callbackCount: 2 }),
    row('t-marcus', 'job-1', 12, null),
    row('t-marcus', 'job-2', 13, 'in_progress'),
    row('t-dana', 'job-4', 12, 'not_started'),
    // Shared job: appears under both technicians, counted once in the totals.
    row('t-dana', 'job-3', 14, 'submitted', { callbackCount: 2 }),
    // Excluded job type (case and whitespace insensitive).
    row('t-dana', 'job-5', 15, null, { jobTypeName: ' estimate ' }),
    // Technician not in the active list (inactive or non-technician staff): ignored.
    row('t-office', 'job-6', 12, null),
  ];

  it('groups by technician with per-technician counts and distinct-job totals', () => {
    const tracker = buildTracker({ technicians: TECHS, rows, excludedJobTypes: ['Estimate'] });

    expect(tracker.groups.map((g) => g.technician.name)).toEqual([
      'Dana Okafor',
      'Luis Ferreira',
      'Marcus Rivera',
    ]);
    const [dana, luis, marcus] = tracker.groups;

    expect(marcus.jobs.map((j) => j.hcpJobId)).toEqual(['job-1', 'job-2', 'job-3']);
    expect(marcus.jobs.map((j) => j.status)).toEqual(['missing', 'in_progress', 'submitted']);
    expect(marcus.counts).toEqual({
      jobs: 3,
      submitted: 1,
      inProgress: 1,
      notReached: 0,
      missing: 1,
    });
    expect(marcus.jobs[2].callbackCount).toBe(2);

    expect(dana.jobs.map((j) => j.hcpJobId)).toEqual(['job-4', 'job-3']);
    expect(dana.counts).toEqual({
      jobs: 2,
      submitted: 1,
      inProgress: 0,
      notReached: 0,
      missing: 1,
    });

    expect(luis.jobs).toEqual([]);
    expect(luis.counts).toEqual({
      jobs: 0,
      submitted: 0,
      inProgress: 0,
      notReached: 0,
      missing: 0,
    });

    expect(tracker.totals).toEqual({
      jobs: 4,
      submitted: 1,
      inProgress: 1,
      notReached: 0,
      missing: 2,
    });
    expect(tracker.technicianId).toBeNull();
  });

  it('keeps excluded-type jobs when nothing is excluded', () => {
    const tracker = buildTracker({ technicians: TECHS, rows });
    expect(tracker.groups[0].counts.jobs).toBe(3);
    expect(tracker.totals.jobs).toBe(5);
  });

  it('deduplicates repeated rows for the same technician and job', () => {
    const tracker = buildTracker({
      technicians: TECHS,
      rows: [row('t-luis', 'job-9', 12, null), row('t-luis', 'job-9', 12, null)],
    });
    expect(tracker.groups.find((g) => g.technician.id === 't-luis')?.counts.jobs).toBe(1);
  });

  it('filters to one technician but still lists every technician for the filter', () => {
    const tracker = buildTracker({ technicians: TECHS, rows, technicianId: 't-marcus' });
    expect(tracker.technicianId).toBe('t-marcus');
    expect(tracker.groups).toHaveLength(1);
    expect(tracker.groups[0].technician.id).toBe('t-marcus');
    expect(tracker.totals).toEqual({
      jobs: 3,
      submitted: 1,
      inProgress: 1,
      notReached: 0,
      missing: 1,
    });
    expect(tracker.technicians).toHaveLength(3);
  });

  it('ignores an unknown technician filter', () => {
    const tracker = buildTracker({ technicians: TECHS, rows, technicianId: 'not-a-tech' });
    expect(tracker.technicianId).toBeNull();
    expect(tracker.groups).toHaveLength(3);
  });
});

describe('pay period resolution', () => {
  const stored: ResolvedPeriod[] = [
    { id: 'p1', start_date: '2026-09-28', end_date: '2026-10-11', label: 'Sep 28 to Oct 11, 2026' },
    { id: 'p2', start_date: '2026-10-12', end_date: '2026-10-25', label: 'Oct 12 to Oct 25, 2026' },
  ];
  const rule = DEFAULT_PAY_PERIOD_RULE;
  const today = '2026-10-13';

  it('uses a stored period when the param is its start date', () => {
    expect(resolvePeriodFrom('2026-09-28', stored, rule, today)).toEqual(stored[0]);
  });

  it('falls back to the period containing today for a missing or bad param', () => {
    expect(resolvePeriodFrom(undefined, stored, rule, today)).toEqual(stored[1]);
    expect(resolvePeriodFrom('next-week', stored, rule, today)).toEqual(stored[1]);
    expect(resolvePeriodFrom('2026-02-30', stored, rule, today)).toEqual(stored[1]);
  });

  it('computes from the rule when no stored period covers the date', () => {
    expect(resolvePeriodFrom('2026-11-02', stored, rule, today)).toEqual({
      start_date: '2026-10-26',
      end_date: '2026-11-08',
      label: 'Oct 26 to Nov 8, 2026',
    });
    expect(resolvePeriodFrom(undefined, [], rule, today).start_date).toBe('2026-10-12');
  });

  it('builds neighbours and options, adding the computed current period', () => {
    const nav = buildPeriodNavigation(stored[0], [stored[0]], rule, today);
    expect(nav.prev.start_date).toBe('2026-09-14');
    expect(nav.next).toMatchObject({ start_date: '2026-10-12', end_date: '2026-10-25' });
    expect(nav.currentStart).toBe('2026-10-12');
    expect(nav.options.map((o) => o.start_date)).toEqual(['2026-10-12', '2026-09-28']);
  });

  it('parses the stored rule, falling back to the default', () => {
    expect(parsePayPeriodRule({ cadence: 'weekly', anchor: '2026-07-06' })).toEqual({
      cadence: 'weekly',
      anchor: '2026-07-06',
    });
    expect(parsePayPeriodRule({ cadence: 'daily', anchor: '2026-07-06' })).toEqual(rule);
    expect(parsePayPeriodRule(null)).toEqual(rule);
  });
});
