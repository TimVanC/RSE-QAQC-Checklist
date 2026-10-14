import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

import * as schema from './schema';

function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env.local and set the Neon connection string.',
    );
  }
  return drizzle(neon(url), { schema });
}

export type Db = ReturnType<typeof createDb>;

let cached: Db | undefined;

/**
 * Lazy singleton for the Drizzle client (Neon HTTP driver).
 * Reads DATABASE_URL on first call, never at import time, so `next build` works without it.
 */
export function getDb(): Db {
  cached ??= createDb();
  return cached;
}
