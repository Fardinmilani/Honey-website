import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig, devices } from '@playwright/test';

import { loadRepoEnv } from './e2e/helpers/load-env.ts';

const webRoot = path.dirname(fileURLToPath(import.meta.url));
loadRepoEnv(path.join(webRoot, '..'));

if (
  process.env['DATABASE_URL'] === undefined &&
  process.env['DATABASE_MIGRATION_URL'] === undefined
) {
  process.env['DATABASE_URL'] =
    'postgresql://honey_local:replace-with-local-development-password@localhost:5432/honey_local';
}

const port = Number(process.env.WEB_PORT ?? 3000);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;
const internalApiUrl = (process.env.INTERNAL_API_URL ?? 'http://127.0.0.1:4000').replace(
  /\/$/u,
  '',
);
const apiReadyUrl = `${internalApiUrl}/readyz`;
const repoRoot = '..';

const sharedWebEnv = {
  ...process.env,
  NODE_ENV: 'production',
  PORT: String(port),
  HOSTNAME: '127.0.0.1',
  NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${port}`,
  PUBLIC_SITE_URL: `http://127.0.0.1:${port}`,
  INTERNAL_API_URL: internalApiUrl,
  WEB_INDEXING_ENABLED: 'false',
};

/**
 * Catalog E2E requires a running API with seed data.
 * - Default: Playwright starts API (`pnpm --filter @honey/api start`) then the standalone web server.
 * - CI: global setup runs `pnpm db:migrate && pnpm db:seed` against the job Postgres service.
 * - External stack: set PLAYWRIGHT_BASE_URL and ensure INTERNAL_API_URL points at a seeded API.
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 60_000,
  expect: {
    toHaveScreenshot: {
      maxDiffPixels: 800,
      animations: 'disabled',
    },
  },
  snapshotPathTemplate: '{testDir}/{testFileDir}/{testFileName}-snapshots/{arg}{ext}',
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL,
    trace: 'on-first-retry',
    video: 'off',
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : [
        {
          command: 'pnpm --filter @honey/api start',
          cwd: repoRoot,
          url: apiReadyUrl,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          env: {
            ...process.env,
            NODE_ENV: 'development',
            API_HOST: '127.0.0.1',
            API_PORT: '4000',
            INTERNAL_API_URL: internalApiUrl,
            PUBLIC_SITE_URL: sharedWebEnv.PUBLIC_SITE_URL,
            NEXT_PUBLIC_SITE_URL: sharedWebEnv.NEXT_PUBLIC_SITE_URL,
          },
        },
        {
          command: 'node .next/standalone/apps/web/server.js',
          cwd: '.',
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          env: sharedWebEnv,
        },
      ],
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Local Windows may be blocked from Playwright CDN; CI installs bundled Chromium.
        ...(process.env.CI ? {} : { channel: process.env.PLAYWRIGHT_CHANNEL ?? 'msedge' }),
      },
    },
  ],
});
