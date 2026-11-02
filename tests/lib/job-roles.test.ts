import { describe, expect, it } from 'vitest';
import { creditShares, LEAD_SHARE, rolesNeeded, sharePercent } from '@/src/lib/job-roles';

const A = 'tech-a';
const B = 'tech-b';
const C = 'tech-c';

function shareOf(shares: ReturnType<typeof creditShares>, id: string): number {
  return shares.find((s) => s.technicianId === id)?.share ?? NaN;
}

describe('creditShares', () => {
  it("is RSE's 60/40 rule", () => {
    expect(LEAD_SHARE).toBe(0.6);
  });

  it('gives a lone technician full credit whatever the role', () => {
    expect(creditShares([{ technicianId: A, role: null }])).toEqual([
      { technicianId: A, share: 1 },
    ]);
    expect(creditShares([{ technicianId: A, role: 'assistant' }])).toEqual([
      { technicianId: A, share: 1 },
    ]);
  });

  it('splits lead 60 / assistant 40', () => {
    const s = creditShares([
      { technicianId: A, role: 'lead' },
      { technicianId: B, role: 'assistant' },
    ]);
    expect(shareOf(s, A)).toBeCloseTo(0.6);
    expect(shareOf(s, B)).toBeCloseTo(0.4);
  });

  it('treats an unmarked second technician as the assistant once a lead is set', () => {
    const s = creditShares([
      { technicianId: A, role: 'lead' },
      { technicianId: B, role: null },
    ]);
    expect(shareOf(s, A)).toBeCloseTo(0.6);
    expect(shareOf(s, B)).toBeCloseTo(0.4);
  });

  it('splits evenly while no lead is set', () => {
    const s = creditShares([
      { technicianId: A, role: null },
      { technicianId: B, role: null },
    ]);
    expect(shareOf(s, A)).toBeCloseTo(0.5);
    expect(shareOf(s, B)).toBeCloseTo(0.5);
    const all = creditShares([
      { technicianId: A, role: 'assistant' },
      { technicianId: B, role: 'assistant' },
    ]);
    expect(shareOf(all, A)).toBeCloseTo(0.5);
  });

  it('shares the remaining 40% between several assistants', () => {
    const s = creditShares([
      { technicianId: A, role: 'lead' },
      { technicianId: B, role: 'assistant' },
      { technicianId: C, role: null },
    ]);
    expect(shareOf(s, A)).toBeCloseTo(0.6);
    expect(shareOf(s, B)).toBeCloseTo(0.2);
    expect(shareOf(s, C)).toBeCloseTo(0.2);
  });

  it('always sums to one checklist', () => {
    const cases = [
      [{ technicianId: A, role: null }],
      [
        { technicianId: A, role: 'lead' },
        { technicianId: B, role: null },
      ],
      [
        { technicianId: A, role: null },
        { technicianId: B, role: null },
        { technicianId: C, role: null },
      ],
      [
        { technicianId: A, role: 'lead' },
        { technicianId: B, role: 'lead' },
        { technicianId: C, role: null },
      ],
    ] as const;
    for (const assignees of cases) {
      const total = creditShares(assignees).reduce((sum, s) => sum + s.share, 0);
      expect(total).toBeCloseTo(1);
    }
  });

  it('ignores duplicate assignee rows and returns nothing for none', () => {
    expect(creditShares([])).toEqual([]);
    expect(
      creditShares([
        { technicianId: A, role: null },
        { technicianId: A, role: 'lead' },
      ]),
    ).toEqual([{ technicianId: A, share: 1 }]);
  });
});

describe('rolesNeeded', () => {
  it('flags a shared job with no lead', () => {
    expect(
      rolesNeeded([
        { technicianId: A, role: null },
        { technicianId: B, role: null },
      ]),
    ).toBe(true);
    expect(
      rolesNeeded([
        { technicianId: A, role: 'assistant' },
        { technicianId: B, role: null },
      ]),
    ).toBe(true);
  });
  it('is quiet for a lone technician or once a lead is set', () => {
    expect(rolesNeeded([{ technicianId: A, role: null }])).toBe(false);
    expect(
      rolesNeeded([
        { technicianId: A, role: 'lead' },
        { technicianId: B, role: null },
      ]),
    ).toBe(false);
    expect(rolesNeeded([])).toBe(false);
  });
});

describe('sharePercent', () => {
  it('rounds to whole percents', () => {
    expect(sharePercent(0.6)).toBe('60%');
    expect(sharePercent(1 / 3)).toBe('33%');
    expect(sharePercent(1)).toBe('100%');
  });
});
