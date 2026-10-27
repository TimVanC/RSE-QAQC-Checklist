import { describe, expect, it } from 'vitest';
import {
  excludeJobTypes,
  groupQueueRows,
  jobWorkState,
  parseExcludedJobTypes,
  type QueueRow,
} from '@/src/server/queries/queue-groups';

const TECHS = {
  marcus: {
    technicianId: 't-marcus',
    technicianFirstName: 'Marcus',
    technicianLastName: 'Rivera',
    technicianColorHex: '#2563eb',
  },
  dana: {
    technicianId: 't-dana',
    technicianFirstName: 'Dana',
    technicianLastName: 'Okafor',
    technicianColorHex: '#16a34a',
  },
  danaB: {
    technicianId: 't-dana-b',
    technicianFirstName: 'dana',
    technicianLastName: 'Baker',
    technicianColorHex: null,
  },
  none: {
    technicianId: null,
    technicianFirstName: null,
    technicianLastName: null,
    technicianColorHex: null,
  },
} as const;

function row(
  hcpJobId: string,
  hour: number,
  tech: (typeof TECHS)[keyof typeof TECHS],
  extra: Partial<QueueRow> = {},
): QueueRow {
  return {
    hcpJobId,
    invoiceNumber: null,
    customerName: `Customer ${hcpJobId}`,
    addressFormatted: null,
    jobTypeName: 'HVAC Service Call',
    tags: [],
    workStatus: 'scheduled',
    scheduledStart: new Date(Date.UTC(2026, 9, 13, hour + 4)),
    scheduledEnd: new Date(Date.UTC(2026, 9, 13, hour + 6)),
    startedAt: null,
    completedAt: null,
    canceledAt: null,
    totalAmountCents: null,
    checklistId: null,
    checklistStatus: null,
    checklistSubmittedAt: null,
    checklistUpdatedAt: null,
    callbackCount: 0,
    ...tech,
    ...extra,
  };
}

describe('groupQueueRows', () => {
  it('shows not reached after a failed call attempt and counts it per technician', () => {
    const at = new Date('2026-10-13T23:00:00Z');
    const groups = groupQueueRows([
      row('job-1', 9, TECHS.marcus, {
        lastCall: { outcome: 'no_answer', at, note: 'voicemail', byName: 'Ana' },
        callAttempts: 2,
      }),
      row('job-2', 10, TECHS.marcus, {
        checklistId: 'c2',
        checklistStatus: 'in_progress',
        checklistUpdatedAt: new Date('2026-10-13T23:30:00Z'),
        lastCall: { outcome: 'no_answer', at, note: null, byName: 'Ana' },
        callAttempts: 1,
      }),
    ]);
    expect(groups[0].jobs.map((j) => j.checklistStatus)).toEqual(['not_reached', 'in_progress']);
    expect(groups[0].jobs[0].callAttempts).toBe(2);
    expect(groups[0].notReachedCount).toBe(1);
  });

  it('returns no groups for no rows', () => {
    expect(groupQueueRows([])).toEqual([]);
  });

  it('orders groups by first then last name (case-insensitive) and jobs by scheduled start', () => {
    const groups = groupQueueRows([
      row('j3', 14, TECHS.marcus),
      row('j1', 8, TECHS.marcus),
      row('j2', 9, TECHS.dana),
      row('j4', 10, TECHS.danaB),
    ]);
    expect(groups.map((g) => g.name)).toEqual(['dana Baker', 'Dana Okafor', 'Marcus Rivera']);
    expect(groups[2].jobs.map((j) => j.hcpJobId)).toEqual(['j1', 'j3']);
    expect(groups[2].technician).toMatchObject({ id: 't-marcus', colorHex: '#2563eb' });
  });

  it('lists a job with several technicians under each of them', () => {
    const groups = groupQueueRows([row('shared', 8, TECHS.marcus), row('shared', 8, TECHS.dana)]);
    expect(groups.map((g) => [g.name, g.jobs.map((j) => j.hcpJobId)])).toEqual([
      ['Dana Okafor', ['shared']],
      ['Marcus Rivera', ['shared']],
    ]);
  });

  it('puts jobs without a technician in Unassigned, last', () => {
    const groups = groupQueueRows([row('orphan', 7, TECHS.none), row('j1', 9, TECHS.marcus)]);
    expect(groups.map((g) => g.key)).toEqual(['t-marcus', 'unassigned']);
    expect(groups[1]).toMatchObject({ name: 'Unassigned', technician: null });
    expect(groups[1].jobs.map((j) => j.hcpJobId)).toEqual(['orphan']);
  });

  it('does not list a job as Unassigned when it also has office staff (null technician rows)', () => {
    const groups = groupQueueRows([row('mixed', 8, TECHS.none), row('mixed', 8, TECHS.dana)]);
    expect(groups.map((g) => g.key)).toEqual(['t-dana']);
  });

  it('maps checklist status (not_started when no row) and counts submitted and canceled', () => {
    const groups = groupQueueRows([
      row('a', 8, TECHS.dana),
      row('b', 9, TECHS.dana, {
        checklistId: 'c1',
        checklistStatus: 'in_progress',
        callbackCount: 2,
      }),
      row('c', 10, TECHS.dana, {
        checklistId: 'c2',
        checklistStatus: 'submitted',
        checklistSubmittedAt: new Date('2026-10-13T23:00:00Z'),
      }),
      row('d', 11, TECHS.dana, { workStatus: 'user canceled' }),
    ]);
    const [dana] = groups;
    expect(dana.jobs.map((j) => j.checklistStatus)).toEqual([
      'not_started',
      'in_progress',
      'submitted',
      'not_started',
    ]);
    expect(dana.jobs[0].checklist).toBeNull();
    expect(dana.jobs[1]).toMatchObject({
      checklist: { id: 'c1', status: 'in_progress' },
      callbackCount: 2,
    });
    expect(dana.submittedCount).toBe(1);
    expect(dana.canceledCount).toBe(1);
  });

  it('breaks scheduled-start ties by customer name and sorts missing starts last', () => {
    const groups = groupQueueRows([
      row('late', 8, TECHS.dana, { scheduledStart: null }),
      row('b', 8, TECHS.dana, { customerName: 'Zed' }),
      row('a', 8, TECHS.dana, { customerName: 'Amy' }),
    ]);
    expect(groups[0].jobs.map((j) => j.hcpJobId)).toEqual(['a', 'b', 'late']);
  });
});

describe('jobWorkState', () => {
  const base = { workStatus: 'scheduled', canceledAt: null, completedAt: null, startedAt: null };
  it.each([
    [{ ...base }, 'scheduled'],
    [{ ...base, workStatus: 'needs scheduling' }, 'scheduled'],
    [{ ...base, workStatus: 'in progress' }, 'in_progress'],
    [{ ...base, startedAt: new Date() }, 'in_progress'],
    [{ ...base, workStatus: 'complete unrated' }, 'completed'],
    [{ ...base, workStatus: 'complete rated' }, 'completed'],
    [{ ...base, workStatus: 'pro canceled' }, 'canceled'],
    [{ ...base, workStatus: 'in progress', canceledAt: new Date() }, 'canceled'],
  ] as const)('%o -> %s', (job, expected) => {
    expect(jobWorkState(job)).toBe(expected);
  });
});

describe('excluded job types', () => {
  it('parses only a string array', () => {
    expect(parseExcludedJobTypes(undefined)).toEqual([]);
    expect(parseExcludedJobTypes({ a: 1 })).toEqual([]);
    expect(parseExcludedJobTypes([' Estimate ', 3, '', null, 'Warranty'])).toEqual([
      'Estimate',
      'Warranty',
    ]);
  });

  it('drops excluded job types case-insensitively and keeps jobs without a type', () => {
    const rows = [
      row('a', 8, TECHS.dana, { jobTypeName: 'Estimate' }),
      row('b', 9, TECHS.dana, { jobTypeName: 'estimate ' }),
      row('c', 10, TECHS.dana, { jobTypeName: null }),
      row('d', 11, TECHS.dana),
    ];
    expect(excludeJobTypes(rows, ['Estimate']).map((r) => r.hcpJobId)).toEqual(['c', 'd']);
    expect(excludeJobTypes(rows, [])).toBe(rows);
  });
});
