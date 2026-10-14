/**
 * Day-1 Housecall Pro verification. Read-only. Run once the API key exists:
 *
 *   node --env-file-if-exists=.env.local --import tsx scripts/verify-hcp.ts
 *
 * Prints the facts the docs could not confirm (docs/reference/housecall-pro-api.md):
 *   1. company time zone
 *   2. raw timestamp strings on a recent completed job (scheduled vs work_timestamps vs created/updated)
 *      so the UTC assumption in src/lib/hcp/mappers.ts can be confirmed or corrected
 *   3. money fields on that job's invoice (cents or dollars)
 *   4. the largest page_size the API honours
 *   5. employee roles seen (for the is_technician heuristic)
 * Record the answers in docs/reference/housecall-pro-api.md.
 */
import { HcpClient } from '../src/lib/hcp/client';
import type { HcpJob } from '../src/lib/hcp/types';

async function main() {
  const client = new HcpClient({ logger: { warn: console.warn, info: () => {} } });

  console.log('== 1. company ==');
  const company = await client.company();
  console.log({ name: company.name, time_zone: company.time_zone, locations: company.locations?.length ?? 0 });

  console.log('\n== 5. employees ==');
  const employees = await client.employees();
  const roles = new Map<string, number>();
  for (const e of employees) roles.set(e.role ?? '(null)', (roles.get(e.role ?? '(null)') ?? 0) + 1);
  console.log({ count: employees.length, roles: Object.fromEntries(roles) });

  console.log('\n== 2. recent completed jobs (raw timestamps) ==');
  const since = new Date(Date.now() - 30 * 24 * 3_600_000).toISOString();
  const jobs: HcpJob[] = [];
  for await (const job of client.jobs({ scheduled_start_min: since, work_status: ['completed'], sort_by: 'updated_at', sort_direction: 'desc', page_size: 5, expand: ['appointments'] })) {
    jobs.push(job);
    if (jobs.length >= 3) break;
  }
  for (const job of jobs) {
    console.log({
      id: job.id,
      invoice_number: job.invoice_number,
      work_status: job.work_status,
      scheduled_start: job.schedule?.scheduled_start,
      scheduled_start_local: job.schedule?.scheduled_start_local,
      time_zone: job.schedule?.time_zone,
      on_my_way_at: job.work_timestamps?.on_my_way_at,
      started_at: job.work_timestamps?.started_at,
      completed_at: job.work_timestamps?.completed_at,
      created_at: job.created_at,
      updated_at: job.updated_at,
      appointment_times: job.schedule?.appointments?.map((a) => [a.start_date, a.start_time, a.end_time]),
      total_amount: job.total_amount,
      outstanding_balance: job.outstanding_balance,
      job_type: job.job_fields?.job_type?.name,
      tags: job.tags,
      assigned: job.assigned_employees?.map((e) => `${e.first_name} ${e.last_name} (${e.role})`),
    });
  }
  if (jobs.length === 0) console.log('(no completed jobs in the last 30 days; widen the window)');

  console.log('\n== 3. invoice money fields ==');
  if (jobs[0]) {
    const invoices = await client.jobInvoices(jobs[0].id);
    for (const inv of invoices) {
      console.log({
        id: inv.id,
        status: inv.status,
        amount: inv.amount,
        due_amount: inv.due_amount,
        paid_at: inv.paid_at,
        payments: inv.payments?.map((p) => ({ amount: p.amount, method: p.payment_method, paid_at: p.paid_at })),
      });
    }
    if (invoices.length === 0) console.log('(no invoices on that job)');
  }

  console.log('\n== 4. page_size probe ==');
  for (const size of [50, 100, 200]) {
    try {
      const data = await client.get<{ page_size?: number; jobs?: unknown[] }>('/jobs', { page: 1, page_size: size });
      console.log({ requested: size, honoured: data.page_size, returned: data.jobs?.length });
    } catch (err) {
      console.log({ requested: size, error: String(err) });
    }
  }

  console.log('\nInterpretation: if started_at/completed_at carry no Z/offset and differ from scheduled_start by the');
  console.log('local UTC offset, they are local time and parseHcpTimestamp must be changed to use the company time zone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
