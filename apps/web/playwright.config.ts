import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.WEB_PORT ?? 3000);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './e2e',
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
    : {
        command: 'node .next/standalone/apps/web/server.js',
        cwd: '.',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          ...process.env,
          NODE_ENV: 'production',
          PORT: String(port),
          HOSTNAME: '127.0.0.1',
          NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${port}`,
          PUBLIC_SITE_URL: `http://127.0.0.1:${port}`,
          INTERNAL_API_URL: process.env.INTERNAL_API_URL ?? 'http://127.0.0.1:4000',
        },
      },
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
