import { defineConfig, devices } from '@playwright/test';
const webOrigin = 'http://127.0.0.1:3107';
const apiOrigin = 'http://127.0.0.1:4107';
if (process.env['ADMIN_E2E_USERS'] === undefined || process.env['DATABASE_URL'] === undefined)
  throw new Error('Run the isolated Phase 17 browser command.');
const common = {
  ...process.env,
  SESSION_COOKIE_NAME: 'honey_session',
  CSRF_COOKIE_NAME: 'csrf_token',
  CSRF_HEADER_NAME: 'x-csrf-token',
  PUBLIC_SITE_URL: webOrigin,
  NEXT_PUBLIC_SITE_URL: webOrigin,
  INTERNAL_API_URL: apiOrigin,
  WEB_INDEXING_ENABLED: 'false',
  S3_BROWSER_ENDPOINT: process.env['S3_BROWSER_ENDPOINT'] ?? 'http://localhost:9000',
  PUBLIC_MEDIA_BASE_URL:
    process.env['PUBLIC_MEDIA_BASE_URL'] ?? 'http://localhost:9000/honey-media',
};
export default defineConfig({
  testDir: './e2e',
  testMatch: 'admin-console.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180000,
  reporter: [['list']],
  use: { baseURL: webOrigin, trace: 'off', video: 'off', screenshot: 'off', actionTimeout: 15000 },
  projects: [
    {
      name: 'admin-chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(process.env['CI'] ? {} : { channel: process.env['PLAYWRIGHT_CHANNEL'] ?? 'msedge' }),
      },
    },
  ],
  webServer: [
    {
      command: 'node apps/api/dist/main.js',
      cwd: '../..',
      url: `${apiOrigin}/readyz`,
      reuseExistingServer: false,
      timeout: 120000,
      env: {
        ...common,
        NODE_ENV: 'development',
        API_PORT: '4107',
        API_HOST: '127.0.0.1',
        API_RATE_LIMIT_MAX: '10000',
        PAYMENT_PROVIDER: 'mock',
        PAYMENT_CALLBACK_URL: `${webOrigin}/en/checkout/payment-return`,
      },
    },
    {
      command: 'node .next/standalone/apps/web/server.js',
      url: webOrigin,
      reuseExistingServer: false,
      timeout: 120000,
      env: { ...common, NODE_ENV: 'production', PORT: '3107', HOSTNAME: '127.0.0.1' },
    },
  ],
});
