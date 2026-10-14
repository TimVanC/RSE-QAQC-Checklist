import { getAuth } from '@/src/lib/auth/server';

export const dynamic = 'force-dynamic';

const handlers = getAuth().handler();

export const GET = handlers.GET;
export const POST = handlers.POST;
