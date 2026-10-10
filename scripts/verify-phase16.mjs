import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, readFile, readdir } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const root = process.cwd();

async function git(...args) {
  const { stdout } = await execute('git', args, { cwd: root, encoding: 'utf8' });
  return stdout.trim();
}

async function read(path) {
  return readFile(resolve(root, path), 'utf8');
}

async function files(directory) {
  const result = [];
  async function visit(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      if (['node_modules', 'dist', '.turbo', '.next'].includes(entry.name)) continue;
      const full = resolve(path, entry.name);
      if (entry.isDirectory()) await visit(full);
      else result.push(full);
    }
  }
  await visit(resolve(root, directory));
  return result;
}

async function exists(path) {
  await access(resolve(root, path));
}

const required = [
  'apps/worker/src/main.ts',
  'apps/worker/src/runtime.ts',
  'apps/worker/src/worker.module.ts',
  'apps/worker/src/config.ts',
  'apps/worker/src/failure-policy.ts',
  'apps/worker/src/outbox-dispatcher.ts',
  'apps/worker/src/outbox-routing.ts',
  'packages/backend/src/jobs/contracts.ts',
  'packages/backend/src/platform/domain/backup-verification.port.ts',
  'packages/backend/src/platform/application/backup-verification.service.ts',
  'packages/backend/src/platform/domain/sitemap-revalidation.port.ts',
  'packages/backend/src/platform/infrastructure/prisma-outbox-dispatch.repository.ts',
  'packages/backend/src/platform/infrastructure/prisma-job-failure.repository.ts',
  'packages/db/prisma/migrations/20261005120000_phase16_background_jobs/migration.sql',
  'docker/worker.Dockerfile',
  'apps/worker/scripts/docker-sigterm-smoke.mjs',
  'docs/background-jobs-development.md',
];
await Promise.all(required.map(exists));

const workerFiles = (await files('apps/worker/src')).filter((path) => extname(path) === '.ts');
const worker = (await Promise.all(workerFiles.map((path) => readFile(path, 'utf8')))).join('\n');
const runtime = await read('apps/worker/src/runtime.ts');
const main = await read('apps/worker/src/main.ts');
const config = await read('apps/worker/src/config.ts');
const contracts = await read('packages/backend/src/jobs/contracts.ts');
const routing = await read('apps/worker/src/outbox-routing.ts');
const dispatcher = await read('apps/worker/src/outbox-dispatcher.ts');
const failurePolicy = await read('apps/worker/src/failure-policy.ts');
const outboxRepository = await read(
  'packages/backend/src/platform/infrastructure/prisma-outbox-dispatch.repository.ts',
);
const failureRepository = await read(
  'packages/backend/src/platform/infrastructure/prisma-job-failure.repository.ts',
);
const schema = await read('packages/db/prisma/schema.prisma');
const migration = await read(
  'packages/db/prisma/migrations/20261005120000_phase16_background_jobs/migration.sql',
);
const workerTests = workerFiles
  .filter((path) => /\.test\.ts$/u.test(path))
  .map((path) => relative(root, path).replaceAll('\\', '/'));
const testText = workerFiles
  .filter((path) => /\.test\.ts$/u.test(path))
  .map((path) => readFile(path, 'utf8'));
const tests = (await Promise.all(testText)).join('\n');

// Composition and boundaries.
assert.match(runtime, /NestFactory\.createApplicationContext\(/u);
assert.doesNotMatch(runtime, /NestFactory\.create\(/u);
assert.match(main, /SIGTERM/u);
const sigtermSmoke = await read('apps/worker/scripts/docker-sigterm-smoke.mjs');
assert.match(sigtermSmoke, /docker\(\['stop'/u);
assert.match(sigtermSmoke, /worker\.job_completed/u);
assert.match(main, /--healthcheck/u);
assert.match(runtime, /worker\.close\(/u);
assert.match(runtime, /queue\.close\(/u);
assert.match(runtime, /this\.#app\?\.close\(/u);
assert.doesNotMatch(
  worker,
  /(?:from\s*|import\s*\(|require\s*\()['"](?:@honey\/(?:api|web|db|contracts)|apps\/(?:api|web)|\.\.[/\\].*(?:apps\/(?:api|web)|packages\/db))/u,
);
assert.doesNotMatch(worker, /INTERNAL_API_URL|localhost:4000|\/v1\/admin\//u);
assert.doesNotMatch(runtime, /applyPaymentOutcome|repairCurrentState|sendMail\(/u);

// Central queue names, versioned runtime decoding, and backward compatibility.
for (const name of [
  'outbox',
  'email',
  'sms',
  'inventory',
  'orders',
  'payments',
  'media',
  'search',
  'cache',
  'maintenance',
]) {
  assert.match(contracts, new RegExp(`'${name}'`, 'u'), `Missing queue: ${name}`);
}
assert.match(contracts, /version:\s*1/u);
assert.match(contracts, /decodeJobEnvelope\(/u);
assert.match(contracts, /UNSUPPORTED_JOB_VERSION/u);
assert.match(contracts, /exactKeys\(/u);
assert.match(contracts, /deterministicJobId/u);
assert.match(contracts, /inventoryCursor\(/u);
assert.match(tests, /version:\s*1/u);
assert.match(tests, /version:\s*2|UNSUPPORTED_JOB_VERSION/u);
assert.match(tests, /previous|compatib|legacy/iu);
assert.match(runtime, /decodeJobEnvelope\(job\.data/u);

// Outbox transport is bounded, leased, fenced, and confirmed after enqueue.
assert.match(outboxRepository, /SKIP LOCKED/iu);
assert.match(outboxRepository, /claim_token/u);
assert.match(outboxRepository, /limit/u);
assert.ok(
  dispatcher.indexOf('this.enqueuer.add(') < dispatcher.indexOf('markDispatched('),
  'Outbox must enqueue before marking dispatched.',
);
assert.match(dispatcher, /releaseClaim\(/u);
assert.match(routing, /NO_ACTIVE_CONSUMER|UNSUPPORTED_EVENT/u);
assert.match(routing, /shipment\.shipped|shipment\.delivered/u);
assert.match(routing, /catalog\./u);

// Bounded retry, durable terminal metadata, and operational visibility.
assert.match(failurePolicy, /attempts:\s*[2-9]/u);
assert.match(failurePolicy, /exponential/u);
assert.match(failurePolicy, /jitter/u);
assert.match(failurePolicy, /classifyFailure/u);
assert.match(failurePolicy, /removeOnComplete/u);
assert.match(failurePolicy, /removeOnFail/u);
assert.match(failurePolicy, /UNCLASSIFIED_PERMANENT/u);
assert.doesNotMatch(failurePolicy, /UNCLASSIFIED_TRANSIENT/u);
assert.match(runtime, /worker\.dead_letter_alert/u);
assert.match(runtime, /countUnresolvedByQueue/u);
assert.match(runtime, /oldestWaitingAgeMs/u);
assert.match(runtime, /pendingCount/u);
assert.match(failureRepository, /recordTerminalFailure/u);
assert.match(schema, /@@unique\(\[queue, jobId, terminalCycle\]\)/u);
assert.match(migration, /job_failure_safe_metadata/u);
assert.match(migration, /NEW\.payload\s*:=\s*'\{\}'::jsonb/u);
assert.match(migration, /job_failure_attempts_non_negative/u);

// Schedule activation is idempotent and backup verification remains deferred.
assert.match(runtime, /upsertJobScheduler\(/u);
assert.match(runtime, /report\.hasMore/u);
assert.match(runtime, /key: `page-\$\{key\}`/u);
for (const name of [
  'reservationSweep',
  'paymentReconcile',
  'inventoryReconcile',
  'sitemapRegenerate',
]) {
  assert.match(runtime, new RegExp(`JOB_NAMES\\.${name}`, 'u'));
}
assert.match(runtime, /BACKUP_CAPABILITY_DISABLED/u);
assert.match(runtime, /backupVerifier\.verify\(/u);
assert.doesNotMatch(runtime, /name:\s*JOB_NAMES\.backupVerify/u);
assert.match(config, /BACKUP_VERIFICATION_ENABLED/u);
assert.match(config, /Phase 20 concrete verifier/u);
assert.match(await read('.env.example'), /BACKUP_VERIFICATION_ENABLED=false/u);
assert.match(await read('docs/implementation-phases.md'), /disabled until Phase 20/u);
assert.match(await read('docs/background-jobs-development.md'), /DEFERRED_BY_CAPABILITY/u);
assert.match(
  await read('apps/web/src/app/api/bff/revalidate/route.ts'),
  /revalidateTag\(catalogTags\.locale\(parsed\.locale\)/u,
);
for (const path of ['docker-compose.prod.yml', 'docker/prod', 'infra/runbooks/restore.md']) {
  await assert.rejects(access(resolve(root, path)), undefined, `${path} belongs to Phase 20.`);
}

// The worker image is headless, non-root, and contains only app/runtime packages.
const dockerfile = await read('docker/worker.Dockerfile');
assert.match(dockerfile, /FROM .* AS build/u);
assert.match(dockerfile, /--frozen-lockfile/u);
assert.match(dockerfile, /USER node/u);
assert.match(dockerfile, /ENTRYPOINT \["\/sbin\/tini", "--"\]/u);
assert.match(dockerfile, /CMD \["node", "apps\/worker\/dist\/main\.js"\]/u);
assert.doesNotMatch(dockerfile, /EXPOSE|apps\/web|media\/hero|COPY .*\.env/u);
const compose = await read('docker-compose.yml');
assert.match(compose, /profiles:\s*\['worker'\]/u);
assert.doesNotMatch(compose, /worker:[\s\S]{0,1200}ports:/u);

// CI and integrity retain prior-phase boundaries.
const packageJson = JSON.parse(await read('package.json'));
const workerPackage = JSON.parse(await read('apps/worker/package.json'));
assert.equal(packageJson.scripts['phase16:verify'], 'node scripts/verify-phase16.mjs');
assert.equal(workerPackage.dependencies.bullmq, '5.81.5');
assert.ok(workerTests.length >= 3, 'Worker needs focused unit/integration tests.');
const ci = await read('.github/workflows/ci.yml');
for (const gate of [
  'pnpm worker:test',
  'pnpm phase16:verify',
  'pnpm worker:docker:build',
  'pnpm worker:smoke:sigterm',
]) {
  assert.ok(ci.includes(gate), `CI lacks ${gate}.`);
}
assert.equal(await git('status', '--porcelain', '--', 'apps/web/public/media/hero'), '');
assert.equal(await git('diff', '--stat', 'HEAD', '--', 'apps/web/public/media/hero'), '');
const heroPaths = (await git('ls-files', 'apps/web/public/media/hero'))
  .split(/\r?\n/u)
  .filter(Boolean);
assert.equal(heroPaths.length, 8, 'Expected eight protected Hero files.');
for (const path of heroPaths) {
  assert.equal(await git('hash-object', path), await git('rev-parse', `HEAD:${path}`));
}
assert.equal(await git('ls-files', '.env'), '', '.env must be untracked.');
assert.equal(await git('diff', '--cached', '--name-only'), '', 'Staging must be empty.');
assert.equal(
  await git('status', '--porcelain', '--', 'apps/web/src/app/[locale]/(admin)'),
  '',
  'Phase 17 admin console changed.',
);
assert.equal(
  await git('diff', '--name-only', 'HEAD', '--', 'packages/db/prisma/migrations'),
  '',
  'An applied historical migration changed.',
);

process.stdout.write('Phase 16 background jobs structural verification passed.\n');
