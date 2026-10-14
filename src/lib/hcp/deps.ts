import 'server-only';
import { getDb } from '@/src/db';
import { getHcpClient } from './client';
import type { SyncDeps } from './sync';

/** Production dependencies for the sync functions. Throws if HCP_API_KEY or DATABASE_URL is missing. */
export function getSyncDeps(): SyncDeps {
  return {
    db: getDb(),
    hcp: getHcpClient(),
    log: (message, meta) => console.log(message, meta ? JSON.stringify(meta) : ''),
  };
}

export function hcpConfigured(): boolean {
  return Boolean(process.env.HCP_API_KEY);
}
