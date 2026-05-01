import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  poweredByHeader: false,
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'img.clerk.com' },
      { protocol: 'https', hostname: '*.clerk.accounts.dev' },
    ],
  },
};

// withSentryConfig is a no-op for runtime when DSN is unset; it only affects
// the build (source map upload). Source map upload requires SENTRY_AUTH_TOKEN
// and SENTRY_ORG / SENTRY_PROJECT. Without those, the wrapper still returns
// the original config unchanged at runtime.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Suppress build-time logs unless the user opts in
  silent: !process.env.SENTRY_AUTH_TOKEN,
  // Only upload source maps when an auth token is provided
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
  // Tunnels Sentry requests through a Next route to bypass ad-blockers.
  // Not enabled — keep MVP simple. Add `tunnelRoute: '/monitoring'` later if needed.
});
