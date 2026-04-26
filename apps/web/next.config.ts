import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // We use Biome for linting, not ESLint. Disable the built-in ESLint step.
    ignoreDuringBuilds: true,
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  disableLogger: true,
  // Source map upload is Phase 4
  sourcemaps: { disable: true },
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
});
