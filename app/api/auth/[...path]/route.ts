import { getAuth } from '@/src/lib/auth/server';

export const dynamic = 'force-dynamic';

// Handlers are created per request, not at import time, so `next build` does not need the
// auth env vars (CI builds without them).
function handlers() {
  return getAuth().handler();
}

export function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return handlers().GET(request, context);
}

export function POST(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return handlers().POST(request, context);
}
