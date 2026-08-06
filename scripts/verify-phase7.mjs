import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, readFile, readdir } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const root = process.cwd();
const required = [
  'packages/backend/src/modules/media/domain/storage.port.ts',
  'packages/backend/src/modules/media/domain/upload-intent.port.ts',
  'packages/backend/src/modules/media/domain/media-repository.port.ts',
  'packages/backend/src/modules/media/application/media.service.ts',
  'packages/backend/src/modules/media/infrastructure/s3-storage.adapter.ts',
  'packages/backend/src/modules/media/infrastructure/in-memory-storage.adapter.ts',
  'packages/backend/src/modules/media/infrastructure/redis-upload-intent.adapter.ts',
  'packages/backend/src/modules/media/infrastructure/in-memory-upload-intent.adapter.ts',
  'packages/backend/src/modules/media/infrastructure/magic-content-inspector.ts',
  'packages/backend/src/modules/media/infrastructure/sharp-media-processor.ts',
  'packages/backend/src/modules/media/infrastructure/prisma-media.repository.ts',
  'packages/backend/src/modules/media/media.module.ts',
  'packages/backend/test/storage.contract.ts',
  'packages/backend/test/storage.fake.contract.test.ts',
  'packages/backend/test/storage.minio.contract.test.ts',
  'packages/backend/test/media.test.ts',
  'packages/backend/test/media.integration.test.ts',
  'packages/backend/test/media.minio.integration.test.ts',
  'apps/api/src/modules/media/media.controller.ts',
  'packages/db/prisma/migrations/20260806190000_media_storage_invariants/migration.sql',
  'docs/adr/0024-media-upload-processing.md',
  'docs/media-development.md',
];
for (const path of required) await access(resolve(root, path));

async function files(directory) {
  const output = [];
  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      if (['node_modules', 'dist', '.turbo'].includes(entry.name)) continue;
      const path = resolve(current, entry.name);
      if (entry.isDirectory()) await visit(path);
      else output.push(path);
    }
  }
  await visit(resolve(root, directory));
  return output;
}

const storagePort = await readFile(resolve(root, required[0]), 'utf8');
for (const operation of [
  'createDirectUploadAuthorization',
  'inspectObject',
  'readObjectRange',
  'putTrustedObject',
  'copyObject',
  'deleteObject',
  'objectExists',
  'createSignedDownloadUrl',
]) {
  assert.ok(storagePort.includes(operation), `StorageService is missing ${operation}.`);
}
assert.doesNotMatch(storagePort, /@aws-sdk|@smithy|fastify|@honey\/db|Prisma/iu);

const apiSourceFiles = (await files('apps/api/src')).filter((path) =>
  ['.ts', '.tsx', '.js', '.mjs'].includes(extname(path)),
);
for (const path of apiSourceFiles) {
  const source = await readFile(path, 'utf8');
  assert.doesNotMatch(
    source,
    /from\s+['"](?:@aws-sdk\/|@smithy\/|sharp(?:\/|['"])|file-type(?:\/|['"])|@honey\/db(?:\/|['"])|@prisma\/|prisma(?:\/|['"]))/u,
    `${relative(root, path)} bypasses the backend media boundary`,
  );
}

for (const path of await files('packages/backend/src/modules/media/domain')) {
  const source = await readFile(path, 'utf8');
  assert.doesNotMatch(
    source,
    /@nestjs|fastify|@honey\/db|@prisma|prisma|@aws-sdk|@smithy|sharp|file-type|redis/iu,
  );
}

const controller = await readFile(
  resolve(root, 'apps/api/src/modules/media/media.controller.ts'),
  'utf8',
);
for (const route of [
  "'upload-intents'",
  "'upload-intents/:uploadId/complete'",
  "':assetId'",
  "':assetId/alt-text'",
  "':assetId/private-url'",
]) {
  assert.ok(controller.includes(route), `Media route ${route} is missing.`);
}
assert.match(controller, /@Delete\(':assetId'\)/u);
assert.equal((controller.match(/@RequirePermissions\('content:write'\)/gu) ?? []).length, 6);
assert.doesNotMatch(controller, /ProductMedia|catalog|product.*attach/iu);
assert.doesNotMatch(controller, /@Body\(\).*storageKey|@Body\(\).*bucket/iu);

const inspector = await readFile(
  resolve(root, 'packages/backend/src/modules/media/infrastructure/magic-content-inspector.ts'),
  'utf8',
);
for (const proof of ['fileTypeFromBuffer', '0x4d, 0x5a', '0x7f, 0x45, 0x4c, 0x46', '<svg']) {
  assert.ok(inspector.includes(proof), `Magic-number validation is missing ${proof}.`);
}
const processor = await readFile(
  resolve(root, 'packages/backend/src/modules/media/infrastructure/sharp-media-processor.ts'),
  'utf8',
);
for (const proof of [
  'limitInputPixels',
  '.rotate()',
  'withoutEnlargement',
  'MEDIA_DERIVATIVE_PROFILE',
]) {
  assert.ok(processor.includes(proof), `Image processing is missing ${proof}.`);
}
const mediaTests = await readFile(resolve(root, 'packages/backend/test/media.test.ts'), 'utf8');
for (const proof of [
  'synthetic EXIF GPS',
  'renamed executables',
  'SVG with misleading MIME',
  'fake clock',
  'owner-bound',
  'never enlarges',
]) {
  assert.ok(mediaTests.includes(proof), `Media tests are missing ${proof}.`);
}

const service = await readFile(
  resolve(root, 'packages/backend/src/modules/media/application/media.service.ts'),
  'utf8',
);
assert.match(service, /randomUUID\(\)/u);
assert.match(service, /quarantine\/\$\{uploadId\}\/original/u);
assert.match(service, /privateDownloadTtlSeconds/u);
assert.doesNotMatch(service, /apps\/api|ProductMedia|BullMQ|ffmpeg/iu);

const worker = await readFile(resolve(root, 'apps/worker/src/index.ts'), 'utf8');
assert.match(worker, /Phase 2 workspace marker/u);
await assert.rejects(access(resolve(root, 'packages/backend/src/modules/catalog')));
await assert.rejects(access(resolve(root, 'apps/api/src/modules/catalog')));

const manifests = await Promise.all(
  [resolve(root, 'package.json'), ...(await files('apps')), ...(await files('packages'))]
    .filter((path) => path.endsWith('package.json'))
    .filter((path) => !path.includes('node_modules'))
    .map((path) => readFile(path, 'utf8')),
);
assert.doesNotMatch(
  manifests.join('\n'),
  /"(?:bullmq|ffmpeg|fluent-ffmpeg|cloudinary|next)"\s*:/iu,
);

for (const [path, expected] of [
  [
    'packages/db/prisma/migrations/20260805231327_initial_foundation/migration.sql',
    'e0b8e84429945e903d11923e96bbf5d25003bd7f',
  ],
  [
    'packages/db/prisma/migrations/20260806120000_identity_authorization/migration.sql',
    '268c3f323460a91b334780ccf73737653420da36',
  ],
]) {
  const { stdout } = await execute('git', ['hash-object', path], { cwd: root, encoding: 'utf8' });
  assert.equal(stdout.trim(), expected, `Accepted migration ${path} changed.`);
}

const ci = await readFile(resolve(root, '.github/workflows/ci.yml'), 'utf8');
for (const gate of [
  'minio/minio:RELEASE.2025-09-07T16-13-09Z',
  'MEDIA_MINIO_TESTS',
  'storage.minio.contract.test.ts',
  'pnpm phase7:verify',
]) {
  assert.ok(ci.includes(gate), `Phase 7 CI is missing ${gate}.`);
}

const { stdout: trackedEnv } = await execute('git', ['ls-files', '.env'], {
  cwd: root,
  encoding: 'utf8',
});
assert.equal(trackedEnv.trim(), '');
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

process.stdout.write('Phase 7 media and storage structural verification passed.\n');
