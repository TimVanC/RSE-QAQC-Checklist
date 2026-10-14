import 'server-only';
import { createNeonAuth } from '@neondatabase/auth/next/server';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

let instance: ReturnType<typeof createNeonAuth> | null = null;

/**
 * Server-side Neon Managed Better Auth instance (session cookies, API proxy, middleware).
 * Created lazily so `next build` does not need the env vars.
 */
export function getAuth() {
  if (!instance) {
    instance = createNeonAuth({
      baseUrl: required('NEON_AUTH_BASE_URL'),
      cookies: {
        secret: required('NEON_AUTH_COOKIE_SECRET'),
        sameSite: 'lax',
      },
      logLevel: process.env.NODE_ENV === 'production' ? 'warn' : 'info',
    });
  }
  return instance;
}
