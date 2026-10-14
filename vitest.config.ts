import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    // `server-only` throws outside React Server Components; tests get a no-op so server modules load.
    alias: { '@': root, 'server-only': `${root}/tests/mocks/server-only.ts` },
  },
  test: {
    // Database-backed tests live under tests/integration and run via `npm run test:db`.
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/integration/**', 'node_modules/**'],
    environment: 'node',
  },
});
