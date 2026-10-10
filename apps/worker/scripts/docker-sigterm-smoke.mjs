import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { QUEUE_NAMES, JOB_NAMES, createJobEnvelope, deterministicJobId } from '@honey/backend';
import { Queue } from 'bullmq';
import { Client } from 'pg';

const execFileAsync = promisify(execFile);
const image = process.env.WORKER_SMOKE_IMAGE ?? 'honey-worker:phase16';
const network = process.env.WORKER_SMOKE_DOCKER_NETWORK ?? 'honey-local-internal';
const hostNetwork = network === 'host';
const localDatabaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://honey_local:replace-with-local-development-password@127.0.0.1:5432/honey_local';
const localRedisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const parsedRedis = new URL(localRedisUrl);
const prismaDirectory = fileURLToPath(new URL('../../../packages/db/', import.meta.url));
const prismaCli = fileURLToPath(
  new URL('../../../packages/db/node_modules/prisma/build/index.js', import.meta.url),
);
const queueNames = QUEUE_NAMES;
const marker = randomUUID().replaceAll('-', '').slice(0, 20);
const databaseName = `honey_phase16_signal_${marker}`;
const containerName = `honey-phase16-signal-${marker}`;
const prefix = `p16signal-${marker}`;
const secret = randomBytes(32).toString('hex');

if (!['localhost', '127.0.0.1'].includes(new URL(localDatabaseUrl).hostname)) {
  throw new Error('Docker signal smoke requires local PostgreSQL.');
}
if (!['localhost', '127.0.0.1'].includes(new URL(localRedisUrl).hostname)) {
  throw new Error('Docker signal smoke requires local Redis.');
}
if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u.test(image) || !/^[A-Za-z0-9_-]+$/u.test(network)) {
  throw new Error('Invalid smoke image or network name.');
}

async function docker(args, options = {}) {
  return execFileAsync('docker', args, { timeout: 45_000, windowsHide: true, ...options });
}

function endpointUrl(input, host, port) {
  const url = new URL(input);
  url.hostname = host;
  url.port = String(port);
  return url.toString();
}

async function createDatabase() {
  const adminUrl = new URL(localDatabaseUrl);
  adminUrl.pathname = '/postgres';
  const targetUrl = new URL(localDatabaseUrl);
  targetUrl.pathname = `/${databaseName}`;
  const admin = new Client({
    connectionString: adminUrl.toString(),
    connectionTimeoutMillis: 10_000,
  });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${databaseName}" TEMPLATE template0`);
  } finally {
    await admin.end();
  }
  return { adminUrl: adminUrl.toString(), targetUrl: targetUrl.toString() };
}

async function dropDatabase(adminUrl) {
  const admin = new Client({ connectionString: adminUrl, connectionTimeoutMillis: 10_000 });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
  } finally {
    await admin.end();
  }
}

async function migrate(databaseUrl) {
  await execFileAsync(
    process.execPath,
    [prismaCli, 'migrate', 'deploy', '--config', 'prisma.config.ts'],
    {
      cwd: prismaDirectory,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      timeout: 120_000,
      windowsHide: true,
    },
  );
}

async function cleanupQueues() {
  for (const name of queueNames) {
    const queue = new Queue(name, { connection: localRedisConnection(), prefix });
    try {
      await queue.obliterate({ force: true });
    } finally {
      await queue.close();
    }
  }
}

function localRedisConnection() {
  return {
    host: parsedRedis.hostname,
    port: Number(parsedRedis.port || '6379'),
    ...(parsedRedis.username ? { username: decodeURIComponent(parsedRedis.username) } : {}),
    ...(parsedRedis.password ? { password: decodeURIComponent(parsedRedis.password) } : {}),
    connectTimeout: 1_000,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  };
}

async function waitForStarted(container) {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    const { stdout } = await docker(['logs', container]);
    if (stdout.includes('"event":"worker.started"')) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Worker did not report startup before SIGTERM.');
}

async function main() {
  let database;
  let containerCreated = false;
  let web;
  let releaseRequest;
  let activeRequest;
  const requestObserved = new Promise((resolve) => {
    activeRequest = resolve;
  });
  try {
    database = await createDatabase();
    await migrate(database.targetUrl);

    web = createServer((request, response) => {
      if (
        request.url !== '/api/bff/revalidate' ||
        request.headers.authorization !== `Bearer ${secret}`
      ) {
        response.writeHead(401).end();
        return;
      }
      releaseRequest = () => {
        if (!response.writableEnded) {
          response.writeHead(200, { 'content-type': 'application/json' }).end('{}');
        }
      };
      activeRequest();
    });
    await new Promise((resolve) => web.listen(0, '0.0.0.0', resolve));
    const address = web.address();
    if (address === null || typeof address === 'string') {
      throw new Error('Smoke HTTP listener unavailable.');
    }

    const dockerEnv = {
      ...process.env,
      NODE_ENV: 'development',
      DATABASE_URL: endpointUrl(database.targetUrl, hostNetwork ? '127.0.0.1' : 'postgres', 5432),
      REDIS_URL: endpointUrl(localRedisUrl, hostNetwork ? '127.0.0.1' : 'redis', 6379),
      WORKER_QUEUE_PREFIX: prefix,
      WORKER_WEB_ORIGIN: `http://${hostNetwork ? '127.0.0.1' : 'host.docker.internal'}:${address.port}`,
      WEB_REVALIDATE_SECRET: secret,
      BACKUP_VERIFICATION_ENABLED: 'false',
      PAYMENT_PROVIDER: 'mock',
      PAYMENT_CALLBACK_URL: `http://${hostNetwork ? '127.0.0.1' : 'host.docker.internal'}:3000/fa/checkout/payment-return`,
      IDENTITY_SMTP_HOST: hostNetwork ? '127.0.0.1' : 'mailpit',
      IDENTITY_SMTP_PORT: '1025',
      IDENTITY_SMTP_SECURE: 'false',
      IDENTITY_EMAIL_FROM: 'worker-smoke@example.test',
      WORKER_OUTBOX_INTERVAL_MS: '300000',
      WORKER_RESERVATION_SWEEP_INTERVAL_MS: '3600000',
      WORKER_PAYMENT_RECONCILE_INTERVAL_MS: '3600000',
      WORKER_INVENTORY_RECONCILE_INTERVAL_MS: '604800000',
      WORKER_SITEMAP_REGENERATE_INTERVAL_MS: '86400000',
      WORKER_SHUTDOWN_GRACE_MS: '20000',
    };
    const passedEnv = [
      'NODE_ENV',
      'DATABASE_URL',
      'REDIS_URL',
      'WORKER_QUEUE_PREFIX',
      'WORKER_WEB_ORIGIN',
      'WEB_REVALIDATE_SECRET',
      'BACKUP_VERIFICATION_ENABLED',
      'PAYMENT_PROVIDER',
      'PAYMENT_CALLBACK_URL',
      'IDENTITY_SMTP_HOST',
      'IDENTITY_SMTP_PORT',
      'IDENTITY_SMTP_SECURE',
      'IDENTITY_EMAIL_FROM',
      'WORKER_OUTBOX_INTERVAL_MS',
      'WORKER_RESERVATION_SWEEP_INTERVAL_MS',
      'WORKER_PAYMENT_RECONCILE_INTERVAL_MS',
      'WORKER_INVENTORY_RECONCILE_INTERVAL_MS',
      'WORKER_SITEMAP_REGENERATE_INTERVAL_MS',
      'WORKER_SHUTDOWN_GRACE_MS',
    ];
    await docker(
      [
        'run',
        '-d',
        '--pull=never',
        '--name',
        containerName,
        '--network',
        network,
        ...(hostNetwork ? [] : ['--add-host', 'host.docker.internal:host-gateway']),
        ...passedEnv.flatMap((key) => ['-e', key]),
        image,
      ],
      { env: dockerEnv },
    );
    containerCreated = true;

    await waitForStarted(containerName);
    const { stdout: probeStatus } = await docker([
      'exec',
      containerName,
      'node',
      '-e',
      "fetch(process.env.WORKER_WEB_ORIGIN + '/api/bff/revalidate', {signal: AbortSignal.timeout(3000)}).then((response) => console.log(response.status)).catch((error) => console.log(error.cause?.code ?? error.name))",
    ]);
    if (probeStatus.trim() !== '401') {
      throw new Error(
        `Worker container could not reach the fixed test web endpoint: ${probeStatus.trim()}`,
      );
    }
    const scheduledQueue = new Queue('maintenance', {
      connection: localRedisConnection(),
      prefix,
    });
    try {
      await scheduledQueue.add(
        JOB_NAMES.sitemapRegenerate,
        createJobEnvelope(JOB_NAMES.sitemapRegenerate, { locale: 'en' }, `smoke-${marker}`),
        {
          jobId: deterministicJobId({ type: JOB_NAMES.sitemapRegenerate, key: `smoke-${marker}` }),
          attempts: 1,
          removeOnComplete: false,
        },
      );
    } finally {
      await scheduledQueue.close();
    }

    let requestTimeout;
    try {
      await Promise.race([
        requestObserved,
        new Promise((_resolve, reject) => {
          requestTimeout = setTimeout(
            () => reject(new Error('No active sitemap job reached the HTTP seam.')),
            90_000,
          );
        }),
      ]);
    } finally {
      clearTimeout(requestTimeout);
    }
    const stop = docker(['stop', '--time', '25', containerName]);
    await new Promise((resolve) => setTimeout(resolve, 300));
    releaseRequest();
    await stop;

    const [{ stdout: logs }, { stdout: status }] = await Promise.all([
      docker(['logs', containerName]),
      docker(['inspect', '--format', '{{.State.ExitCode}}', containerName]),
    ]);
    const events = logs.split(/\r?\n/u).flatMap((line) => {
      try {
        return [JSON.parse(line).event];
      } catch {
        return [];
      }
    });
    if (
      status.trim() !== '0' ||
      !events.includes('worker.started') ||
      !events.includes('worker.shutdown_started') ||
      !events.includes('worker.stopped') ||
      !events.includes('worker.job_completed')
    ) {
      throw new Error('Worker did not complete the active job and exit cleanly on SIGTERM.');
    }
    const maintenance = new Queue('maintenance', {
      connection: localRedisConnection(),
      prefix,
    });
    try {
      const completed = await maintenance.getJobs(['completed'], 0, 99);
      if (!completed.some((job) => job.name === JOB_NAMES.sitemapRegenerate)) {
        throw new Error('No completed sitemap job persisted in BullMQ.');
      }
    } finally {
      await maintenance.close();
    }
    process.stdout.write(
      'Docker SIGTERM smoke passed: active sitemap job completed and worker exited 0.\n',
    );
  } finally {
    if (releaseRequest !== undefined) releaseRequest();
    if (containerCreated) await docker(['rm', '-f', containerName]).catch(() => undefined);
    if (web !== undefined) await new Promise((resolve) => web.close(resolve));
    await cleanupQueues().catch(() => undefined);
    if (database !== undefined) await dropDatabase(database.adminUrl).catch(() => undefined);
  }
}

await main();
