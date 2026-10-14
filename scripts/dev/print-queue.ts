/**
 * Development only: print the call queue for a New Jersey day (default today) without signing in.
 * `react-server` is needed because the queue query module imports `server-only`.
 *
 *   node --conditions=react-server --env-file-if-exists=.env.local --import tsx scripts/dev/print-queue.ts [YYYY-MM-DD]
 */
import { getQueueForDate } from '../../src/server/queries/queue';
import { formatApp, isIsoDate, todayAppDate } from '../../src/lib/time';

async function main() {
  const arg = process.argv[2];
  const date = arg && isIsoDate(arg) ? arg : todayAppDate();
  const { groups, lastSync } = await getQueueForDate(date);

  console.log(`Queue for ${date} (NJ)`);
  console.log(
    lastSync
      ? `Last sync: ${formatApp(lastSync.finishedAt)} (${lastSync.kind})`
      : 'Last sync: none',
  );
  if (groups.length === 0) console.log('No jobs.');
  for (const g of groups) {
    console.log(
      `\n${g.name}: ${g.jobs.length} job(s), ${g.submittedCount} submitted, ${g.canceledCount} canceled`,
    );
    for (const j of g.jobs) {
      const time = `${formatApp(j.scheduledStart, 'h:mm a')}-${formatApp(j.scheduledEnd, 'h:mm a')}`;
      const callbacks = j.callbackCount > 0 ? `, ${j.callbackCount} callback(s)` : '';
      console.log(
        `  ${time}  ${j.hcpJobId}  ${j.jobTypeName ?? '-'}  [${j.workState}]  checklist=${j.checklistStatus}${callbacks}`,
      );
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
