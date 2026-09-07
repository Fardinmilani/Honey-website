import type { NextConfig } from 'next';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildSecurityHeaders } from './src/lib/security-headers';

const configDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.join(configDir, '../..');

function mediaRemotePatterns(): NonNullable<NextConfig['images']>['remotePatterns'] {
  const base =
    process.env['PUBLIC_MEDIA_BASE_URL']?.trim() ||
    process.env['NEXT_PUBLIC_MEDIA_BASE_URL']?.trim();
  if (base === undefined || base === '') {
    return [];
  }

  try {
    const url = new URL(base);
    const protocol = url.protocol.replace(':', '') as 'http' | 'https';
    const pathname = `${url.pathname.replace(/\/$/u, '')}/**`;
    return [
      {
        protocol,
        hostname: url.hostname,
        ...(url.port !== '' ? { port: url.port } : {}),
        pathname,
      },
    ];
  } catch {
    return [];
  }
}

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
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: mediaRemotePatterns(),
  },
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
