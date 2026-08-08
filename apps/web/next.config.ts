import type { NextConfig } from 'next';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildSecurityHeaders } from './src/lib/security-headers';

const configDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.join(configDir, '../..');

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: workspaceRoot,
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: [
    '@honey/ui',
    '@honey/i18n',
    '@honey/contracts',
    '@honey/core',
    '@honey/utils',
  ],
  experimental: {
    optimizePackageImports: ['@honey/ui', '@honey/i18n'],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: buildSecurityHeaders(process.env),
      },
    ];
  },
};

export default nextConfig;
