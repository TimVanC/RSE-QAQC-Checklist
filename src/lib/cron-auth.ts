import { timingSafeEqual } from 'node:crypto';

/**
 * Cron endpoints accept `Authorization: Bearer <CRON_SECRET>` (what Vercel Cron sends when the
 * CRON_SECRET env var is set) or `x-cron-secret: <CRON_SECRET>` for an external pinger.
 */
export type CronAuthResult = 'ok' | 'unconfigured' | 'unauthorized';

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function checkCronAuth(headers: Headers, secret: string | undefined = process.env.CRON_SECRET): CronAuthResult {
  if (!secret) return 'unconfigured';
  const auth = headers.get('authorization') ?? '';
  const bearer = /^Bearer\s+(.+)$/i.exec(auth)?.[1]?.trim();
  if (bearer && safeEqual(bearer, secret)) return 'ok';
  const header = headers.get('x-cron-secret')?.trim();
  if (header && safeEqual(header, secret)) return 'ok';
  return 'unauthorized';
}
