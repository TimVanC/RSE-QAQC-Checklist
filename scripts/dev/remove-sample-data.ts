/**
 * Remove the development sample data loaded by seed-hcp-sample.ts, including any checklists
 * (answers, scores, audit rows) created on those sample jobs. Real Housecall Pro rows are untouched.
 *
 *   npm run dev:remove-sample
 */
import { and, eq, inArray, like, or, sql } from 'drizzle-orm';

async function main() {
  const { getDb } = await import('../../src/db');
  const schema = await import('../../src/db/schema');
  const db = getDb();

  const sampleJobs = await db
    .select({ id: schema.hcpJobs.hcpJobId })
    .from(schema.hcpJobs)
    .where(like(schema.hcpJobs.hcpJobId, 'job_sample_%'));
  const jobIds = sampleJobs.map((j) => j.id);

  let checklistIds: string[] = [];
  if (jobIds.length > 0) {
    const rows = await db.select({ id: schema.checklists.id }).from(schema.checklists).where(inArray(schema.checklists.hcpJobId, jobIds));
    checklistIds = rows.map((r) => r.id);
  }

  const counts: Record<string, number> = {};
  if (checklistIds.length > 0) {
    // Answers and scores cascade from checklists; audit rows do not.
    await db.delete(schema.auditLog).where(
      or(
        and(eq(schema.auditLog.entity, 'checklist'), inArray(schema.auditLog.entityId, checklistIds)),
        and(eq(schema.auditLog.entity, 'checklist_answer'), sql`split_part(${schema.auditLog.entityId}, ':', 1) in (${sql.join(checklistIds.map((id) => sql`${id}`), sql`, `)})`),
      ),
    );
    const deleted = await db.delete(schema.checklists).where(inArray(schema.checklists.id, checklistIds)).returning({ id: schema.checklists.id });
    counts.checklists = deleted.length;
  }
  if (jobIds.length > 0) {
    // Payments, invoices, appointments and assignees cascade from jobs.
    const deleted = await db.delete(schema.hcpJobs).where(inArray(schema.hcpJobs.hcpJobId, jobIds)).returning({ id: schema.hcpJobs.hcpJobId });
    counts.jobs = deleted.length;
  }
  counts.customers = (await db.delete(schema.hcpCustomers).where(like(schema.hcpCustomers.hcpCustomerId, 'cus_sample_%')).returning({ id: schema.hcpCustomers.id })).length;
  counts.technicians = (await db.delete(schema.technicians).where(like(schema.technicians.hcpEmployeeId, 'emp_sample_%')).returning({ id: schema.technicians.id })).length;
  counts.sync_runs = (await db.delete(schema.syncRuns).where(eq(schema.syncRuns.trigger, 'dev-seed')).returning({ id: schema.syncRuns.id })).length;
  console.log('removed', counts);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
