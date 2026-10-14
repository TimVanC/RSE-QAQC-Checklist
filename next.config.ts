import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Every screen depends on the session and on live Housecall Pro data, so pages are rendered
  // dynamically. Cache Components is off to keep session reads simple (no Suspense gymnastics).
  cacheComponents: false,
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default nextConfig;
