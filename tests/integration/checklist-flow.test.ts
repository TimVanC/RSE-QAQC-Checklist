/**
 * End-to-end exercise of the checklist server actions against the real database, with the session
 * mocked to the seeded admin. Run with `npm run test:db` (needs .env.local). Skipped without DATABASE_URL.
 */
import { and, eq, inArray, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const DATABASE_URL = process.env.DATABASE_URL;
const ADMIN_EMAIL = (process.env.SEED_ADMIN_EMAIL ?? '').toLowerCase();

vi.mock('next/cache', () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));

type Role = 'caller' | 'manager' | 'admin';
const mockUser = vi.hoisted(() => ({ id: '', authUserId: 'test-auth', email: '', name: 'Test Admin', role: 'admin' as Role }));

// Self-contained mock: the real module imports the Neon Auth SDK, which needs Next's request context.
vi.mock('@/src/lib/auth/session', async () => {
  const { hasRole } = await import('@/src/lib/auth/roles');
  class ForbiddenError extends Error {
    constructor(message = 'You do not have permission to do that.') {
      super(message);
      this.name = 'ForbiddenError';
    }
  }
  class UnauthenticatedError extends Error {
    constructor() {
      super('Not signed in.');
      this.name = 'UnauthenticatedError';
    }
  }
  const requireRole = async (minimum: Role) => {
    if (!mockUser.id) throw new UnauthenticatedError();
    if (!hasRole(mockUser.role, minimum)) throw new ForbiddenError();
    return mockUser;
  };
  return {
    ForbiddenError,
    UnauthenticatedError,
    requireRole,
    getCurrentUser: async () => (mockUser.id ? mockUser : null),
    requireUser: () => requireRole('caller'),
    requirePageRole: requireRole,
  };
});

describe.skipIf(!DATABASE_URL || !ADMIN_EMAIL)('checklist flow (database)', () => {
  const SAMPLE_JOB = 'job_sample_09';
  let db: typeof import('@/src/db') extends { getDb: () => infer D } ? D : never;
  let schema: typeof import('@/src/db/schema');
  let actions: typeof import('@/src/server/actions/checklists');
  let queries: typeof import('@/src/server/queries/checklists');
  const created: string[] = [];

  beforeAll(async () => {
    db = (await import('@/src/db')).getDb();
    schema = await import('@/src/db/schema');
    actions = await import('@/src/server/actions/checklists');
    queries = await import('@/src/server/queries/checklists');
    const [admin] = await db.select({ id: schema.appUsers.id }).from(schema.appUsers).where(eq(schema.appUsers.email, ADMIN_EMAIL)).limit(1);
    if (!admin) throw new Error(`seed admin ${ADMIN_EMAIL} not found; run npm run db:seed`);
    mockUser.id = admin.id;
    mockUser.email = ADMIN_EMAIL;
    const [job] = await db.select({ id: schema.hcpJobs.hcpJobId }).from(schema.hcpJobs).where(eq(schema.hcpJobs.hcpJobId, SAMPLE_JOB)).limit(1);
    if (!job) throw new Error('sample job missing; run npm run dev:seed-hcp');
    // Start clean in case an earlier run was interrupted.
    const stale = await db.select({ id: schema.checklists.id }).from(schema.checklists).where(eq(schema.checklists.hcpJobId, SAMPLE_JOB));
    if (stale.length) await db.delete(schema.checklists).where(inArray(schema.checklists.id, stale.map((s) => s.id)));
  });

  afterAll(async () => {
    if (!db) return;
    const rows = await db.select({ id: schema.checklists.id }).from(schema.checklists).where(eq(schema.checklists.hcpJobId, SAMPLE_JOB));
    const ids = [...new Set([...created, ...rows.map((r) => r.id)])];
    if (ids.length) {
      await db.delete(schema.checklists).where(inArray(schema.checklists.id, ids));
      await db.delete(schema.auditLog).where(and(eq(schema.auditLog.entity, 'checklist'), inArray(schema.auditLog.entityId, ids)));
      await db.delete(schema.auditLog).where(and(eq(schema.auditLog.entity, 'checklist_answer'), like(schema.auditLog.entityId, `${ids[0]}%`)));
    }
  });

  it('opens, answers, scores, submits, locks, reopens and creates a call back', async () => {
    mockUser.role = 'caller';

    const opened = await actions.openChecklistForJob(SAMPLE_JOB);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    created.push(opened.data.id);
    const id = opened.data.id;
    expect(opened.data.created).toBe(true);

    // Opening again returns the same checklist (unique task per job).
    const again = await actions.openChecklistForJob(SAMPLE_JOB);
    expect(again.ok && again.data.id).toBe(id);

    let detail = await queries.getChecklistDetail(id);
    expect(detail?.checklist.status).toBe('not_started');
    expect(detail?.checklist.customerName).toBeTruthy();
    expect(detail?.score?.bottomLine).toBe(4);
    // The sample job is "in progress" with a start time, so step 1 gets a suggestion.
    expect(detail?.answers.s01?.autoSuggestedValue).toBeTruthy();

    // Answering moves it to in progress and scores on write.
    const a1 = await actions.saveAnswer({ checklistId: id, stepKey: 's02', value: 'Y' });
    expect(a1.ok && a1.data.score.serviceQuote).toBe(1);
    const a2 = await actions.saveAnswer({ checklistId: id, stepKey: 's22', value: 'Y' });
    expect(a2.ok && a2.data.score.failOpsCheck).toBe(1);
    expect(a2.ok && a2.data.score.bottomLine).toBe(3);
    detail = await queries.getChecklistDetail(id);
    expect(detail?.checklist.status).toBe('in_progress');

    // Unknown step keys and bad values are rejected.
    expect((await actions.saveAnswer({ checklistId: id, stepKey: 's99', value: 'Y' })).ok).toBe(false);

    // Fields.
    expect((await actions.saveField({ checklistId: id, field: 'notes', value: 'integration test' })).ok).toBe(true);
    expect((await actions.saveField({ checklistId: id, field: 'project_type', value: 'HVAC' })).ok).toBe(true);
    expect((await actions.saveField({ checklistId: id, field: 'permit_submitted_on', value: '2026-07-07' })).ok).toBe(true);
    expect((await actions.saveField({ checklistId: id, field: 'permit_submitted_on', value: 'not-a-date' })).ok).toBe(false);

    // Call back requires step 31 = Y.
    expect((await actions.createCallbackChecklist(id)).ok).toBe(false);

    // Step 33 = B survives submit; step 31 = Y marks a callback failure.
    expect((await actions.saveAnswer({ checklistId: id, stepKey: 's33', value: 'B' })).ok).toBe(true);
    expect((await actions.saveAnswer({ checklistId: id, stepKey: 's31', value: 'Y' })).ok).toBe(true);
    const submitted = await actions.submitChecklist(id);
    expect(submitted.ok).toBe(true);
    detail = await queries.getChecklistDetail(id);
    expect(detail?.checklist.status).toBe('submitted');
    expect(detail?.checklist.submittedBy).toBe(mockUser.id);
    expect(detail?.answers.s33?.value).toBe('B');
    expect(detail?.score?.failCallback).toBe(1);

    // Locked for callers; double submit rejected.
    expect((await actions.saveAnswer({ checklistId: id, stepKey: 's03', value: 'Y' })).ok).toBe(false);
    expect((await actions.saveField({ checklistId: id, field: 'notes', value: 'x' })).ok).toBe(false);
    expect((await actions.submitChecklist(id)).ok).toBe(false);
    expect((await actions.reopenChecklist(id)).ok).toBe(false); // callers cannot reopen

    // Manager reopens; a blank step 33 then becomes Y on the next submit.
    mockUser.role = 'manager';
    expect((await actions.reopenChecklist(id)).ok).toBe(true);
    detail = await queries.getChecklistDetail(id);
    expect(detail?.checklist.status).toBe('in_progress');
    expect(detail?.checklist.reopenedBy).toBe(mockUser.id);
    expect((await actions.saveAnswer({ checklistId: id, stepKey: 's33', value: null })).ok).toBe(true);
    expect((await actions.submitChecklist(id)).ok).toBe(true);
    detail = await queries.getChecklistDetail(id);
    expect(detail?.answers.s33?.value).toBe('Y');
    expect(detail?.answers.s33?.source).toBe('auto_confirmed');

    // Call back checklist after step 31 = Y (allowed on a submitted parent).
    const cb = await actions.createCallbackChecklist(id);
    expect(cb.ok).toBe(true);
    if (cb.ok) {
      created.push(cb.data.id);
      const cbDetail = await queries.getChecklistDetail(cb.data.id);
      expect(cbDetail?.checklist.type).toBe('callback');
      expect(cbDetail?.checklist.parentChecklistId).toBe(id);
      expect(cbDetail?.parent?.id).toBe(id);
      detail = await queries.getChecklistDetail(id);
      expect(detail?.callbacks.map((c) => c.id)).toContain(cb.data.id);
    }

    // Audit trail exists for the checklist.
    const audit = await db.select({ action: schema.auditLog.action }).from(schema.auditLog).where(and(eq(schema.auditLog.entity, 'checklist'), eq(schema.auditLog.entityId, id)));
    expect(audit.map((a) => a.action)).toEqual(expect.arrayContaining(['create', 'submit', 'reopen']));
  });

  it('refuses unauthenticated calls', async () => {
    const saved = mockUser.id;
    mockUser.id = '';
    expect((await actions.openChecklistForJob(SAMPLE_JOB)).ok).toBe(false);
    mockUser.id = saved;
  });
});
