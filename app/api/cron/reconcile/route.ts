import { NextResponse } from 'next/server';
import { checkCronAuth } from '@/src/lib/cron-auth';
import { getSyncDeps, hcpConfigured } from '@/src/lib/hcp/deps';
import { runReconcile } from '@/src/lib/hcp/sync';
import { processPendingWebhooks } from '@/src/lib/hcp/webhook-processor';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Daily on the Vercel Hobby plan (vercel.json), or every 15 minutes from an external pinger sending
 * the x-cron-secret header: recent window + updated-since watermark + webhook retries.
 */
export async function GET(request: Request) {
  const auth = checkCronAuth(request.headers);
  if (auth !== 'ok') {
    return NextResponse.json({ error: auth }, { status: auth === 'unconfigured' ? 503 : 401 });
  }
  if (!hcpConfigured()) {
    return NextResponse.json({ error: 'HCP_API_KEY not set' }, { status: 503 });
  }
  const deps = getSyncDeps();
  const result = await runReconcile(deps, { trigger: 'cron' });
  const retried = await processPendingWebhooks(deps, result.counts);
  return NextResponse.json({ ...result, webhooksRetried: retried }, { status: result.status === 'ok' ? 200 : 500 });
}
