import assert from 'node:assert/strict';
import { execFile, fork } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const execute = promisify(execFile);
const marker = randomUUID().replaceAll('-', '').slice(0, 12);
const apiName = `honey-phase18-api-${marker}`;
const webName = `honey-phase18-web-${marker}`;
const network = 'honey-local-internal';
const containers = [];
async function docker(args, env = process.env) {
  try {
    const result = await execute('docker', args, { env, windowsHide: true, timeout: 90000 });
    return (args[0] === 'logs' ? result.stdout + result.stderr : result.stdout).trim();
  } catch {
    throw new Error('Phase 18 image smoke failed; Docker diagnostics are redacted.');
  }
}
const fixture = fork(resolve(root, 'packages/db/test/admin-browser-fixture.ts'), [], {
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
async function ready(url) {
  for (let n = 0; n < 60; n++) {
    try {
      const response = await globalThis.fetch(url, {
        signal: globalThis.AbortSignal.timeout(3000),
      });
      if (response.ok) return response;
    } catch {
      /* Bounded startup retry. */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('Image readiness deadline expired.');
}
try {
  const value = await new Promise((accept, reject) => {
    fixture.once('message', accept);
    fixture.once('exit', () => reject(new Error('Fixture exited before readiness.')));
    setTimeout(() => reject(new Error('Fixture deadline expired.')), 150000).unref();
  });
  if (
    value === null ||
    typeof value !== 'object' ||
    typeof value.databaseUrl !== 'string' ||
    typeof value.encryptionKey !== 'string'
  )
    throw new Error('Invalid fixture.');
  const database = new URL(value.databaseUrl);
  database.hostname = 'postgres';
  database.port = '5432';
  const apiEnv = {
    ...process.env,
    NODE_ENV: 'development',
    DATABASE_URL: database.toString(),
    API_HOST: '0.0.0.0',
    API_PORT: '4000',
    REDIS_URL: 'redis://redis:6379',
    PUBLIC_SITE_URL: 'http://127.0.0.1:3109',
    API_ALLOWED_ORIGINS: 'http://127.0.0.1:3109',
    PAYMENT_PROVIDER: 'mock',
    TOTP_ENCRYPTION_KEY_BASE64: value.encryptionKey,
    IDENTITY_SMTP_HOST: 'mailpit',
    CATALOG_CACHE_NAMESPACE: `honey:phase18:smoke:${marker}`,
  };
  const apiKeys = [
    'NODE_ENV',
    'DATABASE_URL',
    'API_HOST',
    'API_PORT',
    'REDIS_URL',
    'PUBLIC_SITE_URL',
    'API_ALLOWED_ORIGINS',
    'PAYMENT_PROVIDER',
    'TOTP_ENCRYPTION_KEY_BASE64',
    'IDENTITY_SMTP_HOST',
    'CATALOG_CACHE_NAMESPACE',
  ];
  for (const image of ['honey-api:phase11', 'honey-web:phase11', 'honey-worker:phase16']) {
    assert.equal(await docker(['run', '--rm', '--entrypoint', 'id', image, '-u']), '1000');
    assert.equal(
      await docker([
        'run',
        '--rm',
        '--entrypoint',
        'sh',
        image,
        '-c',
        'find /app -type f -name .env -o -name .env.local -o -name .env.production',
      ]),
      '',
    );
  }
  await docker(
    [
      'run',
      '-d',
      '--pull=never',
      '--name',
      apiName,
      '--network',
      network,
      '-p',
      '127.0.0.1:4109:4000',
      ...apiKeys.flatMap((key) => ['-e', key]),
      'honey-api:phase11',
    ],
    apiEnv,
  );
  containers.push(apiName);
  await ready('http://127.0.0.1:4109/readyz');
  const faq = await ready('http://127.0.0.1:4109/v1/content/faq?locale=en');
  assert.deepEqual(await faq.json(), { items: [], nextCursor: null, meta: { locale: 'en' } });
  assert.equal((await globalThis.fetch('http://127.0.0.1:4109/v1/admin/reviews')).status, 401);
  assert.equal(
    (await globalThis.fetch('http://127.0.0.1:4109/v1/admin/notifications/templates')).status,
    401,
  );
  const webEnv = {
    ...process.env,
    NODE_ENV: 'production',
    PUBLIC_SITE_URL: 'http://127.0.0.1:3109',
    NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3109',
    INTERNAL_API_URL: `http://${apiName}:4000`,
    WEB_INDEXING_ENABLED: 'false',
    DEBUG: 'next:start-server',
  };
  const webKeys = [
    'NODE_ENV',
    'PUBLIC_SITE_URL',
    'NEXT_PUBLIC_SITE_URL',
    'INTERNAL_API_URL',
    'WEB_INDEXING_ENABLED',
    'DEBUG',
  ];
  await docker(
    [
      'run',
      '-d',
      '--pull=never',
      '--name',
      webName,
      '--network',
      network,
      '-p',
      '127.0.0.1:3109:3000',
      ...webKeys.flatMap((key) => ['-e', key]),
      'honey-web:phase11',
    ],
    webEnv,
  );
  containers.push(webName);
  for (const path of [
    '/en/articles',
    '/fa/maghalat',
    '/en/faq',
    '/fa/porseshha',
    '/en/newsletter/confirm',
  ]) {
    const response = await ready('http://127.0.0.1:3109' + path);
    assert.equal(response.status, 200);
  }
  const workerEnv = {
    ...apiEnv,
    WORKER_WEB_ORIGIN: 'http://127.0.0.1:3109',
    WEB_REVALIDATE_SECRET: marker.repeat(4),
    IDENTITY_EMAIL_FROM: 'phase18-smoke@example.invalid',
  };
  await docker(
    [
      'run',
      '--rm',
      '--network',
      network,
      ...[
        'NODE_ENV',
        'DATABASE_URL',
        'REDIS_URL',
        'PAYMENT_PROVIDER',
        'WORKER_WEB_ORIGIN',
        'WEB_REVALIDATE_SECRET',
        'IDENTITY_SMTP_HOST',
        'IDENTITY_EMAIL_FROM',
      ].flatMap((key) => ['-e', key]),
      'honey-worker:phase16',
      'node',
      'apps/worker/dist/main.js',
      '--healthcheck',
    ],
    workerEnv,
  );
  for (const name of [...containers].reverse()) {
    await docker(['stop', '--time', '20', name]);
    // Next 16.3 intentionally exits 128 + SIGTERM after its awaited cleanup;
    // verify the actual completion marker rather than assuming Node exit 0.
    assert.equal(
      await docker(['inspect', '--format', '{{.State.ExitCode}}', name]),
      name === webName ? '143' : '0',
    );
    assert.equal(await docker(['inspect', '--format', '{{.State.OOMKilled}}', name]), 'false');
    const output = await docker(['logs', name]);
    const completion =
      name === webName ? /start-server process cleanup finished/u : /shutdown.completed/u;
    assert.equal(completion.test(output), true, 'Image did not finish its shutdown cleanup.');
    assert.equal(
      /shutdown.deadline_exceeded/u.test(output),
      false,
      'Image exceeded its shutdown deadline.',
    );
  }
  process.stdout.write(
    'Phase 18 Docker smoke passed: 3 non-root images; no env files; API ready with all modules and protected admin routes; 5 localized web routes; worker Redis readiness; API SIGTERM exit 0; web awaited cleanup completed then framework SIGTERM exit 143; no forced termination or OOM.\n',
  );
} catch (error) {
  for (const name of containers) {
    const status = await docker([
      'inspect',
      '--format',
      '{{.State.Status}}/{{.State.ExitCode}}',
      name,
    ]).catch(() => 'unavailable');
    process.stdout.write('Image state: ' + status + '\n');
    const output = await docker(['logs', name]).catch(() => '');
    const keys = output.match(/Invalid API environment configuration: ([A-Z0-9_, .]+)\./u)?.[1];
    if (keys !== undefined) process.stdout.write('Invalid configuration keys: ' + keys + '\n');
  }
  throw error;
} finally {
  for (const name of containers) await docker(['rm', '-f', name]).catch(() => undefined);
  if (fixture.connected) fixture.send({ stop: true });
  await new Promise((r) => {
    if (fixture.exitCode !== null) r();
    else fixture.once('exit', r);
  });
}
