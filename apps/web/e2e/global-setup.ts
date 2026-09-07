import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadRepoEnv } from './helpers/load-env.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
loadRepoEnv(repoRoot);

const DEFAULT_LOCAL_DATABASE_URL =
  'postgresql://honey_local:replace-with-local-development-password@localhost:5432/honey_local';

function ensureDatabaseUrl(): void {
  if (
    process.env['DATABASE_URL'] === undefined &&
    process.env['DATABASE_MIGRATION_URL'] === undefined
  ) {
    process.env['DATABASE_URL'] = DEFAULT_LOCAL_DATABASE_URL;
  }
}
const DEFAULT_API_URL = 'http://127.0.0.1:4000';
const READY_POLL_MS = 250;
const READY_TIMEOUT_MS = 120_000;

function apiBaseUrl(): string {
  const raw = process.env['INTERNAL_API_URL'] ?? DEFAULT_API_URL;
  return raw.replace(/\/$/u, '');
}

async function waitForReadyz(baseUrl: string): Promise<void> {
  const readyUrl = `${baseUrl}/readyz`;
  const deadline = Date.now() + READY_TIMEOUT_MS;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(readyUrl, { signal: AbortSignal.timeout(5_000) });
      if (response.ok) {
        return;
      }
    } catch {
      // API still starting or unreachable.
    }
    await new Promise((resolve) => setTimeout(resolve, READY_POLL_MS));
  }

  throw new Error(
    `Catalog API is not ready at ${readyUrl}. ` +
      'Start the API with a seeded database (pnpm db:migrate && pnpm db:seed) ' +
      'or set INTERNAL_API_URL to a running instance. ' +
      'Playwright starts the API automatically when PLAYWRIGHT_BASE_URL is unset.',
  );
}

function prepareDatabase(): void {
  ensureDatabaseUrl();
  execSync('pnpm db:migrate && pnpm db:seed', {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env,
  });
}

export default async function globalSetup(): Promise<void> {
  if (process.env['CI'] === 'true' || process.env['E2E_PREPARE_DB'] === 'true') {
    prepareDatabase();
  }

  const externalWeb = process.env['PLAYWRIGHT_BASE_URL'];
  const skipWebServer = process.env['E2E_SKIP_WEBSERVER'] === 'true';

  if ((externalWeb !== undefined && externalWeb !== '') || skipWebServer) {
    await waitForReadyz(apiBaseUrl());
  }
}
