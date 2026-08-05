import { spawnSync } from 'node:child_process';
import { get } from 'node:http';
import { connect } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

const longRunningServices = ['postgres', 'redis', 'minio', 'mailpit'];
const requiredExtensions = ['citext', 'pg_trgm', 'pgcrypto', 'unaccent'];
const timeoutMilliseconds = 120_000;

function runDocker(arguments_, { allowFailure = false, quiet = false } = {}) {
  const result = spawnSync('docker', arguments_, {
    encoding: 'utf8',
    windowsHide: true,
  });

  if (!quiet && result.stdout) {
    process.stdout.write(result.stdout);
  }

  if (!quiet && result.stderr) {
    process.stderr.write(result.stderr);
  }

  if (result.error) {
    throw result.error;
  }

  if (!allowFailure && result.status !== 0) {
    throw new Error(
      `docker ${arguments_.join(' ')} exited with status ${result.status ?? 'unknown'}`,
    );
  }

  return result;
}

function compose(arguments_, options) {
  return runDocker(['compose', ...arguments_], options);
}

function serviceContainerId(service) {
  return compose(['ps', '-a', '-q', service], { quiet: true }).stdout.trim();
}

function inspectValue(containerId, template) {
  return runDocker(['inspect', '--format', template, containerId], { quiet: true }).stdout.trim();
}

function serviceState(service) {
  const containerId = serviceContainerId(service);

  if (!containerId) {
    return 'missing';
  }

  return inspectValue(
    containerId,
    '{{.State.Status}}/{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}',
  );
}

function initState() {
  const containerId = serviceContainerId('minio-init');

  if (!containerId) {
    return 'missing';
  }

  return inspectValue(containerId, '{{.State.Status}}/{{.State.ExitCode}}');
}

async function waitForHealthyStack() {
  const deadline = Date.now() + timeoutMilliseconds;
  let previousSummary = '';

  while (Date.now() < deadline) {
    const states = Object.fromEntries(
      longRunningServices.map((service) => [service, serviceState(service)]),
    );
    const minioInitState = initState();
    const summary = [
      ...longRunningServices.map((service) => `${service}=${states[service]}`),
      `minio-init=${minioInitState}`,
    ].join(' ');

    if (summary !== previousSummary) {
      console.log(summary);
      previousSummary = summary;
    }

    const longRunningHealthy = longRunningServices.every(
      (service) => states[service] === 'running/healthy',
    );
    const initSucceeded = minioInitState === 'exited/0';

    if (longRunningHealthy && initSucceeded) {
      console.log('All long-running services are healthy and minio-init exited successfully.');
      return;
    }

    const failedService = longRunningServices.find((service) => {
      const state = states[service];
      return state?.startsWith('exited/') || state?.startsWith('dead/');
    });

    if (failedService || (minioInitState.startsWith('exited/') && minioInitState !== 'exited/0')) {
      throw new Error(`A service failed before the stack became healthy: ${summary}`);
    }

    await delay(2_000);
  }

  throw new Error(
    `Timed out after ${timeoutMilliseconds / 1_000} seconds waiting for the local stack`,
  );
}

function verifyPostgresExtensions() {
  const query =
    "SELECT extname FROM pg_extension WHERE extname IN ('citext', 'pg_trgm', 'unaccent', 'pgcrypto') ORDER BY extname;";
  const result = compose(
    [
      'exec',
      '-T',
      'postgres',
      'sh',
      '-c',
      `psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --tuples-only --no-align --command "${query}"`,
    ],
    { quiet: true },
  );
  const found = result.stdout
    .split(/\r?\n/u)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .sort();

  if (JSON.stringify(found) !== JSON.stringify(requiredExtensions)) {
    throw new Error(
      `PostgreSQL extensions mismatch: expected ${requiredExtensions.join(', ')}, found ${found.join(', ')}`,
    );
  }

  console.log(`PostgreSQL extensions: ${found.join(', ')}`);
}

function verifyRedis() {
  const result = compose(['exec', '-T', 'redis', 'redis-cli', 'ping'], { quiet: true });

  if (result.stdout.trim() !== 'PONG') {
    throw new Error(`Redis ping returned ${JSON.stringify(result.stdout.trim())} instead of PONG`);
  }

  console.log('Redis ping: PONG');
}

function verifyMinio() {
  compose(['exec', '-T', 'minio', 'curl', '-fsS', 'http://localhost:9000/minio/health/live'], {
    quiet: true,
  });
  console.log('MinIO live endpoint: HTTP success');

  compose(['run', '--rm', 'minio-init']);
  console.log('MinIO initialization rerun: succeeded');

  const authenticatedChecks = [
    'set -eu',
    'mc alias set verify "$MINIO_ENDPOINT" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null',
    'mc stat "verify/$MINIO_PUBLIC_BUCKET" >/dev/null',
    'mc stat "verify/$MINIO_PRIVATE_BUCKET" >/dev/null',
  ].join('\n');

  compose(
    [
      'run',
      '--rm',
      '--no-deps',
      '--entrypoint',
      '/bin/sh',
      'minio-init',
      '-c',
      authenticatedChecks,
    ],
    { quiet: true },
  );

  const getAnonymousPolicy = (bucketVariable) => {
    const script = [
      'set -eu',
      'mc alias set verify "$MINIO_ENDPOINT" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null',
      `mc anonymous get-json "verify/$${bucketVariable}"`,
    ].join('\n');
    const result = compose(
      ['run', '--rm', '--no-deps', '--entrypoint', '/bin/sh', 'minio-init', '-c', script],
      { quiet: true },
    );

    return JSON.parse(result.stdout);
  };

  const publicPolicy = getAnonymousPolicy('MINIO_PUBLIC_BUCKET');
  const privatePolicy = getAnonymousPolicy('MINIO_PRIVATE_BUCKET');
  const publicPolicyJson = JSON.stringify(publicPolicy);

  if (!publicPolicyJson.includes('s3:GetObject')) {
    throw new Error('The public MinIO bucket does not allow anonymous read access');
  }

  if (publicPolicyJson.includes('s3:PutObject')) {
    throw new Error('The public MinIO bucket allows anonymous write access');
  }

  if (
    typeof privatePolicy !== 'object' ||
    privatePolicy === null ||
    Object.keys(privatePolicy).length !== 0
  ) {
    throw new Error('The private MinIO bucket has an anonymous access policy');
  }

  console.log('MinIO authentication, buckets, and anonymous policies: verified');
}

function publishedPort(service, containerPort) {
  const output = compose(['port', service, String(containerPort)], { quiet: true }).stdout.trim();
  const match = /:(\d+)$/u.exec(output);

  if (!match?.[1]) {
    throw new Error(`Could not determine published port for ${service}:${containerPort}`);
  }

  return Number.parseInt(match[1], 10);
}

async function verifyMailpit() {
  const uiPort = publishedPort('mailpit', 8025);
  const smtpPort = publishedPort('mailpit', 1025);
  const statusCode = await new Promise((resolve, reject) => {
    const request = get(`http://127.0.0.1:${uiPort}/readyz`, (response) => {
      response.resume();
      resolve(response.statusCode ?? 0);
    });

    request.setTimeout(5_000, () => {
      request.destroy(new Error(`Timed out checking Mailpit readiness on port ${uiPort}`));
    });
    request.once('error', reject);
  });

  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(`Mailpit readiness endpoint returned HTTP ${statusCode}`);
  }

  console.log(`Mailpit UI readiness: HTTP ${statusCode} on port ${uiPort}`);

  await new Promise((resolve, reject) => {
    const socket = connect({ host: '127.0.0.1', port: smtpPort });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Timed out connecting to Mailpit SMTP on port ${smtpPort}`));
    }, 5_000);

    socket.once('connect', () => {
      clearTimeout(timer);
      socket.end();
      resolve();
    });
    socket.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });

  console.log(`Mailpit SMTP: accepting connections on port ${smtpPort}`);
}

function printDiagnostics() {
  console.error('\nDocker Compose diagnostics:');
  compose(['ps', '-a'], { allowFailure: true });
  compose(['logs', '--tail', '80'], { allowFailure: true });
}

try {
  compose(['config', '--quiet']);
  console.log('Docker Compose configuration: valid');
  await waitForHealthyStack();
  verifyPostgresExtensions();
  verifyRedis();
  verifyMinio();
  await verifyMailpit();
  console.log('Local Docker environment verification passed.');
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  printDiagnostics();
  process.exitCode = 1;
}
