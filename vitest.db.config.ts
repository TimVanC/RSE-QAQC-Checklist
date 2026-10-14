import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const root = dirname(fileURLToPath(import.meta.url));

/**
 * Integration tests against the real Neon database (`npm run test:db`). They need DATABASE_URL and
 * SEED_ADMIN_EMAIL (from .env.local), create their own rows and delete them afterwards.
 */
export default defineConfig({
  resolve: {
    alias: { '@': root, 'server-only': `${root}/tests/mocks/server-only.ts` },
  },
  test: {
    include: ['tests/integration/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
