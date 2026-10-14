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
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
