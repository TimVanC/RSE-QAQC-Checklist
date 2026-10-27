/**
 * Server-render smoke test of the checklist workspace: catches render-time errors and checks the
 * structure (44 rows, callback wording, suggestion badge, locked state) without a browser.
 */
import { createElement, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children?: ReactNode }) =>
    createElement('a', { href, ...rest }, children),
}));
vi.mock('@/src/server/actions/calls', () => ({ logCall: vi.fn() }));
vi.mock('@/src/server/actions/checklists', () => ({
  saveAnswer: vi.fn(),
  saveField: vi.fn(),
  submitChecklist: vi.fn(),
  reopenChecklist: vi.fn(),
  createCallbackChecklist: vi.fn(),
}));

const { ChecklistWorkspace } = await import('@/components/checklist/checklist-workspace');
const { CHECKLIST_STEPS } = await import('@/src/config/checklist-steps');
type WorkspaceData = import('@/components/checklist/types').WorkspaceData;
type WorkspaceUser = import('@/components/checklist/types').WorkspaceUser;

function makeData(
  overrides: Partial<WorkspaceData> = {},
  checklist: Partial<WorkspaceData['checklist']> = {},
): WorkspaceData {
  return {
    checklist: {
      id: '00000000-0000-4000-8000-000000000001',
      type: 'task',
      status: 'in_progress',
      parentChecklistId: null,
      callDate: '2026-07-06',
      projectType: 'HVAC',
      customerName: 'Jane Doe',
      projectLocation: '1 Main St, Newark, NJ',
      projectDate: '2026-07-06',
      referralProjectNo: '1042',
      permitSubmittedOn: null,
      permitFollowupOn: null,
      permitApprovedOn: null,
      partsReceivedOn: null,
      partsOrderNo: null,
      notes: null,
      submittedAt: null,
      reopenedAt: null,
      ...checklist,
    },
    job: {
      hcpJobId: 'job_1',
      invoiceNumber: '1042',
      customerName: 'Jane Doe',
      addressFormatted: '1 Main St, Newark, NJ',
      jobTypeName: 'HVAC repair',
      workStatus: 'complete unrated',
      scheduledStart: '2026-07-06T13:00:00.000Z',
      scheduledEnd: '2026-07-06T15:00:00.000Z',
      totalAmountCents: 45000,
    },
    technicianName: 'Sam Tech',
    assignedTechnicians: [{ name: 'Sam Tech', mobile: '2015550101', email: null }],
    answers: {
      s01: {
        value: null,
        source: 'manual',
        autoSuggestedValue: 'Y',
        autoEvidence: {
          summary: 'Started 35 min before the scheduled start',
          confidence: 'high',
          started_at: '2026-07-06T12:25:00.000Z',
        },
      },
      s22: { value: 'Y', source: 'manual', autoSuggestedValue: null, autoEvidence: null },
    },
    score: null,
    parent: null,
    callbacks: [],
    submittedByName: null,
    callLog: [],
    reopenedByName: null,
    ...overrides,
  };
}

const caller: WorkspaceUser = { id: 'u1', name: 'Caller One', role: 'caller' };
const manager: WorkspaceUser = { id: 'u2', name: 'Manager One', role: 'manager' };

function render(data: WorkspaceData, user: WorkspaceUser = caller): string {
  // React separates adjacent text nodes with <!-- --> markers; drop them for text assertions.
  const html = renderToString(createElement(ChecklistWorkspace, { data, currentUser: user }));
  return html.replace(/<!-- -->/g, '');
}

describe('ChecklistWorkspace (server render)', () => {
  it('renders the task checklist with all 44 steps and the Housecall Pro suggestion', () => {
    const html = render(makeData());
    expect(html).toContain('Appointment/Service Call Checklist');
    expect(html).not.toContain('(CALL BACK)');
    expect(html.match(/data-step="/g)).toHaveLength(CHECKLIST_STEPS.length);
    expect(html).toContain('From Housecall Pro');
    expect(html).toContain('Started 35 min before the scheduled start');
    expect(html).toContain('Submit checklist');
    expect(html).toContain('Back to call queue');
    expect(html).toContain('/queue?date=2026-07-06');
    // step 22 = Y is a failure: the red flag shows in the score panel
    expect(html).toContain('Red · 1 failure');
    expect(html).toContain('Call log');
    expect(html).toContain('No calls logged yet');
    expect(html).toContain('Technician contact');
    expect(html).toContain('href="tel:+12015550101"');
    expect(html).toContain('href="https://wa.me/12015550101"');
    expect(html).toContain('(201) 555-0101');
  });

  it('uses the call back wording and links back to the parent', () => {
    const html = render(
      makeData(
        {
          parent: { id: '00000000-0000-4000-8000-000000000009', type: 'task', status: 'submitted' },
        },
        { type: 'callback', parentChecklistId: '00000000-0000-4000-8000-000000000009' },
      ),
    );
    expect(html).toContain('Appointment/Service Call Checklist (CALL BACK)');
    expect(html).toContain('Return to original appointment checklist');
    expect(html).toContain('Return to original appointment checklist to closeout both checklist.');
  });

  it('offers the call back checklist when step 31 is Y and lists existing call backs', () => {
    const data = makeData({
      callbacks: [
        {
          id: '00000000-0000-4000-8000-000000000002',
          status: 'in_progress',
          createdAt: '2026-07-08T14:00:00.000Z',
          submittedAt: null,
        },
      ],
    });
    data.answers.s31 = {
      value: 'Y',
      source: 'manual',
      autoSuggestedValue: null,
      autoEvidence: null,
    };
    const html = render(data);
    expect(html).toContain('Create another Call Back Checklist');
    expect(html).toContain('/checklists/00000000-0000-4000-8000-000000000002');
  });

  it('locks a submitted checklist; only managers see Reopen', () => {
    const data = makeData(
      { submittedByName: 'Caller One' },
      { status: 'submitted', submittedAt: '2026-07-06T23:00:00.000Z' },
    );
    const asCaller = render(data);
    expect(asCaller).toContain('This checklist is read-only');
    expect(asCaller).not.toContain('>Reopen<');
    expect(asCaller).not.toContain('Submit checklist');
    expect(render(data, manager)).toContain('>Reopen<');
  });
});
