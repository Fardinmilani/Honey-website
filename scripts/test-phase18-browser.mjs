import { fork, spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createAdminTestStorage } from './lib/admin-test-storage.mjs';
import { createPhase18TestServices } from './lib/phase18-test-services.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const fixture = fork(resolve(root, 'packages/db/test/admin-browser-fixture.ts'), ['--phase18'], {
  cwd: root,
  execArgv: [
    '--import',
    pathToFileURL(resolve(root, 'packages/db/node_modules/tsx/dist/loader.mjs')).href,
  ],
  silent: true,
  windowsHide: true,
});
fixture.stdout?.resume();
fixture.stderr?.resume();
let storage, services, worker, browser;
const workerEvents = new Map();
let workerPending = '';
try {
  const value = await new Promise((accept, reject) => {
    fixture.once('message', accept);
    fixture.once('exit', () => reject(new Error('Fixture exited before readiness.')));
    setTimeout(() => reject(new Error('Fixture timed out.')), 150000).unref();
  });
  if (
    value === null ||
    typeof value !== 'object' ||
    typeof value.databaseUrl !== 'string' ||
    typeof value.encryptionKey !== 'string' ||
    !Array.isArray(value.users) ||
    typeof value.ids !== 'object'
  )
    throw new Error('Fixture initialization failed.');
  storage = await createAdminTestStorage(root);
  services = await createPhase18TestServices();
  const env = {
    ...process.env,
    ...storage.env,
    ...services.env,
    DATABASE_URL: value.databaseUrl,
    DATABASE_MIGRATION_URL: value.databaseUrl,
    TOTP_ENCRYPTION_KEY_BASE64: value.encryptionKey,
    ADMIN_E2E_USERS: JSON.stringify(value.users),
    ADMIN_E2E_IDS: JSON.stringify(value.ids),
    CATALOG_CACHE_NAMESPACE: `honey:phase18:${randomUUID().replaceAll('-', '')}`,
    WORKER_QUEUE_PREFIX: `phase18-${randomUUID().replaceAll('-', '').slice(0, 24)}`,
    WEB_REVALIDATE_SECRET: randomBytes(32).toString('base64url'),
    WORKER_WEB_ORIGIN: 'http://127.0.0.1:3107',
    PUBLIC_SITE_URL: 'http://127.0.0.1:3107',
    PAYMENT_PROVIDER: 'mock',
    NODE_ENV: 'development',
    WORKER_OUTBOX_INTERVAL_MS: '1000',
  };
  browser = spawn(
    process.execPath,
    [
      resolve(root, 'apps/web/node_modules/@playwright/test/cli.js'),
      'test',
      '--config=playwright.phase18.config.ts',
      ...process.argv.slice(2),
    ],
    { cwd: resolve(root, 'apps/web'), env, stdio: 'inherit', windowsHide: true },
  );
  // Scheduled work must reach a real ready web process, not exhaust retries
  // while Playwright is still starting its servers.
  const webDeadline = Date.now() + 120000;
  for (;;) {
    try {
      if (
        (
          await globalThis.fetch('http://127.0.0.1:3107/en', {
            signal: globalThis.AbortSignal.timeout(3000),
          })
        ).ok
      )
        break;
    } catch {
      /* Readiness only. */
    }
    if (browser.exitCode !== null || Date.now() > webDeadline)
      throw new Error('Browser web readiness failed.');
    await new Promise((r) => setTimeout(r, 500));
  }
  worker = spawn(process.execPath, [resolve(root, 'apps/worker/dist/main.js')], {
    cwd: root,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  worker.stderr?.resume();
  worker.stdout?.on('data', (chunk) => {
    workerPending += chunk.toString('utf8');
    const lines = workerPending.split(/\r?\n/u);
    workerPending = lines.pop() ?? '';
    for (const line of lines) {
      try {
        const row = JSON.parse(line);
        if (typeof row.event === 'string' && /^worker\.[a-z_]+$/u.test(row.event)) {
          const key =
            row.event +
            (typeof row.name === 'string' && /^[a-z0-9_.-]+$/u.test(row.name)
              ? ':' + row.name
              : '') +
            (typeof row.errorCode === 'string' && /^[A-Z_]+$/u.test(row.errorCode)
              ? ':' + row.errorCode
              : '');
          workerEvents.set(key, (workerEvents.get(key) ?? 0) + 1);
        }
      } catch {
        /* Non-JSON startup output is excluded. */
      }
    }
  });
  await new Promise((accept, reject) => {
    let pending = '';
    worker.stdout?.on('data', (chunk) => {
      pending = (pending + chunk.toString('utf8')).slice(-8000);
      if (pending.includes('worker.started')) accept();
    });
    worker.once('exit', () => reject(new Error('Isolated worker failed before readiness.')));
    setTimeout(() => reject(new Error('Worker readiness timed out.')), 60000).unref();
  });
  process.exitCode = await new Promise((accept, reject) => {
    if (browser.exitCode !== null) accept(browser.exitCode);
    else browser.once('exit', (code) => accept(code ?? 1));
    browser.once('error', reject);
  });
  await storage.assertNoHero();
  process.stdout.write(
    'Isolated worker event counts: ' + JSON.stringify(Object.fromEntries(workerEvents)) + '\n',
  );
} finally {
  if (browser !== undefined && browser.exitCode === null) browser.kill('SIGTERM');
  if (worker !== undefined && worker.exitCode === null) {
    worker.kill('SIGTERM');
    await new Promise((r) => {
      worker.once('exit', r);
      setTimeout(r, 35000).unref();
    });
  }
  if (fixture.connected) fixture.send({ stop: true });
  await new Promise((r) => {
    if (fixture.exitCode !== null) r();
    else fixture.once('exit', r);
  });
  await services?.cleanup();
  await storage?.cleanup();
}
