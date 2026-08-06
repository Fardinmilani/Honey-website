import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, readFile, readdir } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const root = process.cwd();
const required = [
  'packages/backend/src/modules/catalog/domain/catalog.ts',
  'packages/backend/src/modules/catalog/domain/catalog-repository.port.ts',
  'packages/backend/src/modules/catalog/domain/catalog-cache.port.ts',
  'packages/backend/src/modules/catalog/domain/catalog-media.port.ts',
  'packages/backend/src/modules/catalog/application/catalog.service.ts',
  'packages/backend/src/modules/catalog/infrastructure/prisma-catalog.repository.ts',
  'packages/backend/src/modules/catalog/infrastructure/redis-catalog-cache.adapter.ts',
  'packages/backend/src/modules/catalog/infrastructure/in-memory-catalog-cache.adapter.ts',
  'packages/backend/src/modules/catalog/infrastructure/media-catalog.adapter.ts',
  'packages/backend/src/modules/catalog/catalog.module.ts',
  'packages/backend/src/modules/catalog/module.meta.ts',
  'packages/backend/src/modules/catalog/index.ts',
  'apps/api/src/modules/catalog/catalog.controller.ts',
  'packages/backend/test/catalog.test.ts',
  'packages/backend/test/catalog.integration.test.ts',
  'apps/api/test/catalog.test.ts',
  'packages/contracts/test/catalog-public-fields.test.mjs',
  'packages/db/prisma/migrations/20260806220000_catalog_content_model/migration.sql',
  'docs/catalog-development.md',
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

for (const path of await files('packages/backend/src/modules/catalog/domain')) {
  const source = await readFile(path, 'utf8');
  assert.doesNotMatch(
    source,
    /@nestjs|fastify|@honey\/db|@prisma|prisma|redis|@aws-sdk|@smithy|sharp|apps\/api/iu,
    `${relative(root, path)} breaks transport-independent catalog domain layering`,
  );
}

const apiSources = (await files('apps/api/src')).filter((path) =>
  ['.ts', '.tsx', '.js', '.mjs'].includes(extname(path)),
);
for (const path of apiSources) {
  const source = await readFile(path, 'utf8');
  assert.doesNotMatch(
    source,
    /from\s+['"](?:@honey\/db|@prisma\/|prisma(?:\/|['"])|pg(?:\/|['"])|postgres(?:\/|['"])|redis(?:\/|['"]))/u,
    `${relative(root, path)} bypasses the catalog backend boundary`,
  );
}

const catalogInfrastructure = await Promise.all(
  (await files('packages/backend/src/modules/catalog/infrastructure'))
    .filter((path) => path.endsWith('.ts'))
    .map((path) => readFile(path, 'utf8')),
);
assert.doesNotMatch(catalogInfrastructure.join('\n'), /\.(?:mediaAsset|mediaDerivative)\b/u);

const controller = await readFile(
  resolve(root, 'apps/api/src/modules/catalog/catalog.controller.ts'),
  'utf8',
);
for (const route of [
  "'products'",
  "'search'",
  "'products/:slug'",
  "'categories'",
  "'categories/:slug/products'",
  "'collections'",
  "'collections/:slug/products'",
]) {
  assert.ok(controller.includes(route), `Public catalog route ${route} is missing.`);
}
for (const permission of ['catalog:read', 'catalog:write', 'catalog:publish']) {
  assert.ok(
    controller.includes(`@RequirePermissions('${permission}')`),
    `${permission} policy is missing.`,
  );
}
assert.ok((controller.match(/@Public\(\)/gu) ?? []).length >= 9);

const service = await readFile(
  resolve(root, 'packages/backend/src/modules/catalog/application/catalog.service.ts'),
  'utf8',
);
for (const proof of [
  'decodeCursor',
  'cursorFingerprint',
  'LOCALE_UNSUPPORTED',
  'catalog:publish',
  'invalidateTags',
  'resolvePublicAssets',
]) {
  assert.ok(service.includes(proof), `Catalog service is missing ${proof}.`);
}

const migration = await readFile(
  resolve(root, 'packages/db/prisma/migrations/20260806220000_catalog_content_model/migration.sql'),
  'utf8',
);
for (const proof of [
  'honey_catalog_normalize',
  'product_translation_catalog_search_idx',
  'product_variant_one_default_per_product_idx',
  'product_media_product_asset_role_without_variant_idx',
  'product_default_variant_owner_trigger',
]) {
  assert.ok(migration.includes(proof), `Catalog migration is missing ${proof}.`);
}

const tests = [
  await readFile(resolve(root, 'packages/backend/test/catalog.test.ts'), 'utf8'),
  await readFile(resolve(root, 'packages/backend/test/catalog.integration.test.ts'), 'utf8'),
  await readFile(resolve(root, 'apps/api/test/catalog.test.ts'), 'utf8'),
  await readFile(resolve(root, 'packages/contracts/test/catalog-public-fields.test.mjs'), 'utf8'),
].join('\n');
for (const proof of [
  'ييلاقي',
  'كوهستان',
  '\\u200c',
  'nextCursor',
  'priceMin',
  'PRODUCT_PUBLICATION_INCOMPLETE',
  "kind: 'REDIRECT'",
  'public catalog response schemas contain no private',
  'MEDIA_ASSET_NOT_PUBLIC',
]) {
  assert.ok(tests.includes(proof), `Phase 8 tests are missing ${proof}.`);
}

const manifests = await Promise.all(
  [resolve(root, 'package.json'), ...(await files('apps')), ...(await files('packages'))]
    .filter((path) => path.endsWith('package.json'))
    .filter((path) => !path.includes('node_modules'))
    .map((path) => readFile(path, 'utf8')),
);
assert.doesNotMatch(
  manifests.join('\n'),
  /"(?:next|bullmq|@elastic\/elasticsearch|meilisearch|algoliasearch)"\s*:/iu,
);

const web = await readFile(resolve(root, 'apps/web/src/index.ts'), 'utf8');
const worker = await readFile(resolve(root, 'apps/worker/src/index.ts'), 'utf8');
assert.match(web, /Phase 2 workspace marker/u);
assert.match(worker, /Phase 2 workspace marker/u);
for (const path of [
  'packages/backend/src/modules/pricing',
  'packages/backend/src/modules/inventory',
  'apps/web/src/app',
]) {
  await assert.rejects(access(resolve(root, path)));
}

for (const [path, expected] of [
  [
    'packages/db/prisma/migrations/20260805231327_initial_foundation/migration.sql',
    'e0b8e84429945e903d11923e96bbf5d25003bd7f',
  ],
  [
    'packages/db/prisma/migrations/20260806120000_identity_authorization/migration.sql',
    '268c3f323460a91b334780ccf73737653420da36',
  ],
  [
    'packages/db/prisma/migrations/20260806190000_media_storage_invariants/migration.sql',
    'e885f70c2b3616839ef995a19758f808ccb34319',
  ],
]) {
  const { stdout } = await execute('git', ['hash-object', path], { cwd: root, encoding: 'utf8' });
  assert.equal(stdout.trim(), expected, `Accepted migration ${path} changed.`);
}

const ci = await readFile(resolve(root, '.github/workflows/ci.yml'), 'utf8');
for (const gate of [
  'catalog.integration.test.ts',
  'catalog-public-fields.test.mjs',
  'pnpm db:test',
  'pnpm phase8:verify',
  'mc find',
  'pnpm api:docker:build',
]) {
  assert.ok(ci.includes(gate), `Phase 8 CI is missing ${gate}.`);
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

process.stdout.write('Phase 8 catalog and content structural verification passed.\n');
