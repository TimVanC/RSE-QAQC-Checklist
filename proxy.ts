import { getAuth } from '@/src/lib/auth/server';

/**
 * Session gate for the application. Unauthenticated requests are redirected to /login.
 * Authorization (roles) is enforced separately in every page, server action and route handler
 * through `requireUser` / `requireRole` (src/lib/auth/session.ts); this only checks for a session.
 *
 * Public paths: the login page, the auth proxy, Housecall Pro webhooks and cron endpoints
 * (those two verify their own secrets).
 */
export default getAuth().middleware({ loginUrl: '/login' });

export const config = {
  matcher: [
    '/((?!login|no-access|api/auth|api/webhooks|api/cron|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
