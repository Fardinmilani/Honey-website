import { fork, spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createAdminTestStorage } from './lib/admin-test-storage.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const storefront = process.argv.includes('--storefront');
const fixture = fork(resolve(root, 'packages/db/test/admin-browser-fixture.ts'), [], {
  cwd: root,
  execArgv: [
    '--import',
    pathToFileURL(resolve(root, 'packages/db/node_modules/tsx/dist/loader.mjs')).href,
  ],
  silent: true,
  windowsHide: true,
});
// Never print fixture output: initialization errors could include connection metadata.
fixture.stdout?.resume();
fixture.stderr?.resume();
let storage;
try {
  const value = await new Promise((accept, reject) => {
    fixture.once('message', accept);
    fixture.once('exit', () => reject(new Error('Admin fixture exited before readiness.')));
    setTimeout(() => reject(new Error('Admin fixture readiness timed out.')), 150000).unref();
  });
  if (
    value === null ||
    typeof value !== 'object' ||
    typeof value.databaseUrl !== 'string' ||
    typeof value.encryptionKey !== 'string' ||
    !Array.isArray(value.users) ||
    typeof value.ids !== 'object'
  )
    throw new Error('Admin fixture initialization failed.');
  if (!storefront) storage = await createAdminTestStorage(root);
  const child = spawn(
    process.execPath,
    [
      resolve(root, 'apps/web/node_modules/@playwright/test/cli.js'),
      'test',
      `--config=${storefront ? 'playwright.config.ts' : 'playwright.admin.config.ts'}`,
      ...process.argv.slice(2).filter((argument) => argument !== '--storefront'),
    ],
    {
      cwd: resolve(root, 'apps/web'),
      env: {
        ...process.env,
        ...storage?.env,
        DATABASE_URL: value.databaseUrl,
        DATABASE_MIGRATION_URL: value.databaseUrl,
        TOTP_ENCRYPTION_KEY_BASE64: value.encryptionKey,
        ADMIN_E2E_USERS: JSON.stringify(value.users),
        ADMIN_E2E_IDS: JSON.stringify(value.ids),
        CATALOG_CACHE_NAMESPACE: `honey:phase17:${value.databaseUrl.split('/').at(-1)?.replace('honey_phase17_', '')}`,
      },
      stdio: 'inherit',
      windowsHide: true,
    },
  );
  process.exitCode = await new Promise((accept, reject) => {
    child.once('exit', (code) => accept(code ?? 1));
    child.once('error', reject);
  });
} finally {
  if (fixture.connected) fixture.send({ stop: true });
  await new Promise((resolveExit) => {
    if (fixture.exitCode !== null) resolveExit();
    else fixture.once('exit', resolveExit);
  });
  await storage?.cleanup();
}
