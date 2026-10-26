import type { NextConfig } from 'next';

const config: NextConfig = {
  // Native/WASM database engines must not be bundled.
  serverExternalPackages: ['@electric-sql/pglite', 'pg'],
  // The legacy single-page UI and schema are read from disk at runtime.
  outputFileTracingIncludes: {
    '/': ['./legacy/**/*'],
    '/api/**': ['./db/**/*'],
  },
  poweredByHeader: false,
  // Old bookmarks from the previous version of the app.
  async redirects() {
    return [
      { source: '/index.html', destination: '/', permanent: true },
      { source: '/login.html', destination: '/login', permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'same-origin' },
        ],
      },
    ];
  },
};

export default config;
