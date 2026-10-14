import { NextResponse } from 'next/server';
import { ForbiddenError, UnauthenticatedError, requireRole } from '@/src/lib/auth/session';
import { getSyncDeps, hcpConfigured } from '@/src/lib/hcp/deps';
import { runManualRefresh, secondsSinceLastManualRun } from '@/src/lib/hcp/sync';
import { isIsoDate, todayAppDate } from '@/src/lib/time';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const MIN_SECONDS_BETWEEN_MANUAL_RUNS = 60;

/** "Refresh" button on the call queue: re-sync one New Jersey day. Any signed-in user. */
export async function POST(request: Request) {
  let user;
  try {
    user = await requireRole('caller');
  } catch (err) {
    if (err instanceof UnauthenticatedError) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    throw err;
  }
  if (!hcpConfigured()) {
    return NextResponse.json({ error: 'Housecall Pro is not connected yet' }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as { date?: unknown };
  const date = typeof body.date === 'string' && isIsoDate(body.date) ? body.date : todayAppDate();

  const deps = getSyncDeps();
  const now = new Date();
  const since = await secondsSinceLastManualRun(deps.db, now);
  if (since !== null && since < MIN_SECONDS_BETWEEN_MANUAL_RUNS) {
    return NextResponse.json(
      { error: 'refresh already ran recently', retryAfterSeconds: Math.ceil(MIN_SECONDS_BETWEEN_MANUAL_RUNS - since) },
      { status: 429 },
    );
  }

  const result = await runManualRefresh(deps, date, user.id);
  return NextResponse.json({ ...result, date }, { status: result.status === 'ok' ? 200 : 500 });
}
