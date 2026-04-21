import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // We use Biome for linting, not ESLint. Disable the built-in ESLint step.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
