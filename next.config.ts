import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import withSerwistInit from "@serwist/next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: '/my-week', destination: '/my-plan', permanent: true },
      { source: '/plan', destination: '/schedule', permanent: true },
    ]
  },
};

const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  // Active only in production builds; keeps local `next dev` e2e unaffected.
  disable: process.env.NODE_ENV === 'development',
});

export default withSentryConfig(withSerwist(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  disableLogger: true,
});
