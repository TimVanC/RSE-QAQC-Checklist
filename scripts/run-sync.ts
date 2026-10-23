/**
 * Run a Housecall Pro sync from the command line (same code the cron endpoints use).
 *
 *   npm run sync -- backfill     employees + catalog + jobs scheduled within ±30 days
 *   npm run sync -- reconcile    recent window + updated-since watermark
 *   npm run sync -- day 2026-10-23   one New Jersey calendar day
 *
 * Needs DATABASE_URL and HCP_API_KEY (from .env.local). Read-only against Housecall Pro.
 */
import { getSyncDeps } from '../src/lib/hcp/deps';
import { runBackfill, runManualRefresh, runReconcile } from '../src/lib/hcp/sync';
import { isIsoDate } from '../src/lib/time';

async function main() {
  const [kind, arg] = process.argv.slice(2);
  const deps = getSyncDeps();
  let result;
  if (kind === 'backfill') result = await runBackfill(deps, 'cli');
  else if (kind === 'reconcile') result = await runReconcile(deps, { trigger: 'cli' });
  else if (kind === 'day' && arg && isIsoDate(arg)) result = await runManualRefresh(deps, arg, null as unknown as string);
  else {
    console.error('usage: npm run sync -- backfill | reconcile | day YYYY-MM-DD');
    process.exit(2);
  }
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'ok') process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
