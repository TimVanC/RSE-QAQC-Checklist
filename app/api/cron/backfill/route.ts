import { NextResponse } from 'next/server';
import { checkCronAuth } from '@/src/lib/cron-auth';
import { getSyncDeps, hcpConfigured } from '@/src/lib/hcp/deps';
import { runBackfill } from '@/src/lib/hcp/sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Nightly (vercel.json): employees, catalog and a 60-day job window. */
export async function GET(request: Request) {
  const auth = checkCronAuth(request.headers);
  if (auth !== 'ok') {
    return NextResponse.json({ error: auth }, { status: auth === 'unconfigured' ? 503 : 401 });
  }
  if (!hcpConfigured()) {
    return NextResponse.json({ error: 'HCP_API_KEY not set' }, { status: 503 });
  }
  const result = await runBackfill(getSyncDeps(), 'cron');
  return NextResponse.json(result, { status: result.status === 'ok' ? 200 : 500 });
}
