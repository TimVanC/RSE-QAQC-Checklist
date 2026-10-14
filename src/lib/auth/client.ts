'use client';

import { createAuthClient } from '@neondatabase/auth/next';

/** Browser-side auth client; talks to /api/auth/* which proxies to Neon Auth. */
export const authClient = createAuthClient();
