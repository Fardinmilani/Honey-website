import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, readFile, readdir } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const root = process.cwd();
const required = [
  'packages/backend/src/errors/app-error.ts',
  'packages/backend/src/platform/application/health.service.ts',
  'packages/backend/src/platform/infrastructure/prisma-platform.adapter.ts',
  'apps/api/src/main.ts',
  'apps/api/src/app.module.ts',
  'apps/api/src/modules/platform/platform.controller.ts',
  'apps/api/test/api.integration.test.ts',
  'apps/api/test/config.test.ts',
  'apps/api/test/graceful-shutdown.test.ts',
  'apps/api/test/security.test.ts',
  'packages/backend/test/app-error.test.ts',
  'packages/backend/test/platform.test.ts',
  'packages/contracts/openapi.json',
  'packages/contracts/src/generated/api.ts',
  'packages/contracts/test/breaking.test.mjs',
  'docker/api.Dockerfile',
];

async function files(directory) {
  const output = [];
  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = resolve(current, entry.name);
      if (entry.isDirectory()) await visit(path);
      else output.push(path);
    }
  }
  await visit(resolve(root, directory));
  return output;
}

for (const path of required) await access(resolve(root, path));

const apiFiles = (await files('apps/api/src')).filter((path) =>
  ['.ts', '.tsx'].includes(extname(path)),
);
for (const path of apiFiles) {
  const source = await readFile(path, 'utf8');
  assert.doesNotMatch(
    source,
    /from\s+['"]@honey\/db(?:\/|['"])/u,
    `${relative(root, path)} imports @honey/db`,
  );
  assert.doesNotMatch(
    source,
    /from\s+['"](?:@prisma\/|prisma(?:\/|['"]))/u,
    `${relative(root, path)} imports Prisma`,
  );
}

const allSource = [...(await files('apps')), ...(await files('packages'))].filter(
  (path) =>
    ['.ts', '.tsx', '.js', '.mjs'].includes(extname(path)) &&
    !path.includes('node_modules') &&
    !path.includes('dist'),
);
const dbConsumers = [];
for (const path of allSource) {
  const workspacePath = relative(root, path).replaceAll('\\', '/');
  if (workspacePath.startsWith('packages/db/')) continue;
  const source = await readFile(path, 'utf8');
  if (/from\s+['"]@honey\/db(?:\/|['"])/u.test(source)) dbConsumers.push(workspacePath);
}
assert.ok(dbConsumers.length > 0, 'packages/backend must consume @honey/db');
assert.ok(
  dbConsumers.every((path) => path.startsWith('packages/backend/')),
  `unexpected @honey/db consumers: ${dbConsumers.join(', ')}`,
);

for (const forbidden of [
  'docker/worker.Dockerfile',
  'docker/web.Dockerfile',
  'docker-compose.prod.yml',
]) {
  await assert.rejects(
    access(resolve(root, forbidden)),
    undefined,
    `${forbidden} must not exist in Phase 5`,
  );
}
const worker = await readFile(resolve(root, 'apps/worker/src/index.ts'), 'utf8');
assert.match(worker, /Phase 2 workspace marker/u);
const manifests = await Promise.all(
  (await files('apps'))
    .filter((path) => path.endsWith('package.json'))
    .map((path) => readFile(path, 'utf8')),
);
assert.doesNotMatch(manifests.join('\n'), /"(?:bullmq|next)"\s*:/u);

const appModule = await readFile(resolve(root, 'apps/api/src/app.module.ts'), 'utf8');
assert.match(appModule, /AppModule\.controllers\(options\.enableTestRoutes/u);
assert.match(appModule, /PlatformController/u);
const apiModuleDirectories = (
  await readdir(resolve(root, 'apps/api/src/modules'), {
    withFileTypes: true,
  })
)
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);
assert.deepEqual(apiModuleDirectories.sort(), ['catalog', 'identity', 'media', 'platform']);

const createApplication = await readFile(
  resolve(root, 'apps/api/src/bootstrap/create-application.ts'),
  'utf8',
);
assert.match(createApplication, /enableShutdownHooks\(\['SIGTERM', 'SIGINT'\]/u);

const rootManifest = await readFile(resolve(root, 'package.json'), 'utf8');
const apiManifest = await readFile(resolve(root, 'apps/api/package.json'), 'utf8');
const backendManifest = await readFile(resolve(root, 'packages/backend/package.json'), 'utf8');
const contractsManifest = await readFile(resolve(root, 'packages/contracts/package.json'), 'utf8');
for (const script of [
  'api:dev',
  'api:start',
  'api:test',
  'api:openapi:generate',
  'api:openapi:check',
  'api:openapi:lint',
  'api:openapi:breaking',
  'api:docker:build',
  'phase5:verify',
]) {
  assert.ok(rootManifest.includes(`"${script}"`), `root script ${script} is required`);
}
assert.match(apiManifest, /"test":\s*"vitest run"/u);
assert.match(backendManifest, /"test":\s*"vitest run"/u);
assert.match(contractsManifest, /"test":\s*"node --test"/u);

const ci = await readFile(resolve(root, '.github/workflows/ci.yml'), 'utf8');
for (const action of ['actions/checkout@v5', 'actions/setup-node@v5', 'actions/cache@v5'])
  assert.match(ci, new RegExp(action.replace('/', '\\/'), 'u'));
assert.doesNotMatch(ci, /actions\/(?:checkout|setup-node|cache)@v4/u);
assert.match(ci, /package-manager-cache:\s*false/u);
assert.match(ci, /fetch-depth:\s*0/u);
assert.match(ci, /postgres:16/u);
assert.match(ci, /TEST_DATABASE_ADMIN_URL/u);
for (const gate of [
  '--frozen-lockfile',
  'format:check',
  'pnpm lint',
  'pnpm boundaries',
  'pnpm typecheck',
  'pnpm test',
  'pnpm build',
  'pnpm phase4:verify',
  'api:openapi:generate',
  'api:openapi:check',
  'api:openapi:lint',
  'api:openapi:forbidden',
  'api:openapi:breaking',
  'pnpm phase5:verify',
]) {
  assert.ok(ci.includes(gate), `CI must retain the ${gate} gate`);
}

const { stdout: trackedEnv } = await execute('git', ['ls-files', '.env', '.env.*'], {
  cwd: root,
  encoding: 'utf8',
});
const unexpectedEnvironmentFiles = trackedEnv
  .split(/\r?\n/u)
  .filter(Boolean)
  .filter((path) => path !== '.env.example');
assert.deepEqual(unexpectedEnvironmentFiles, []);
const { stdout: heroStatus } = await execute(
  'git',
  ['status', '--porcelain', '--', 'apps/web/public/media/hero'],
  { cwd: root, encoding: 'utf8' },
);
const { stdout: heroDiff } = await execute(
  'git',
  ['diff', '--stat', 'HEAD', '--', 'apps/web/public/media/hero'],
  { cwd: root, encoding: 'utf8' },
);
assert.equal(heroStatus.trim(), '');
assert.equal(heroDiff.trim(), '');

await execute('pnpm', ['api:openapi:check'], {
  cwd: root,
  encoding: 'utf8',
  shell: process.platform === 'win32',
});
await execute('pnpm', ['api:openapi:forbidden'], {
  cwd: root,
  encoding: 'utf8',
  shell: process.platform === 'win32',
});
process.stdout.write('Phase 5 structural verification passed.\n');
