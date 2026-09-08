import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, readFile, readdir } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const root = process.cwd();

const required = [
  'packages/backend/src/modules/sourcing/domain/sourcing.ts',
  'packages/backend/src/modules/sourcing/application/sourcing.service.ts',
  'packages/backend/src/modules/sourcing/infrastructure/prisma-sourcing.repository.ts',
  'packages/backend/src/modules/procurement/domain/procurement.ts',
  'packages/backend/src/modules/procurement/application/procurement.service.ts',
  'packages/backend/src/modules/procurement/infrastructure/prisma-procurement.repository.ts',
  'packages/backend/src/modules/inventory/domain/inventory.ts',
  'packages/backend/src/modules/inventory/application/inventory.service.ts',
  'packages/backend/src/modules/inventory/infrastructure/prisma-inventory.repository.ts',
  'apps/api/src/modules/sourcing/sourcing.controller.ts',
  'apps/api/src/modules/procurement/procurement.controller.ts',
  'apps/api/src/modules/inventory/inventory.controller.ts',
  'packages/backend/test/sourcing.test.ts',
  'packages/backend/test/procurement.test.ts',
  'packages/backend/test/inventory.test.ts',
  'packages/backend/test/phase11.integration.test.ts',
  'apps/api/test/phase11.test.ts',
  'packages/db/prisma/migrations/20260810120000_phase11_sourcing_procurement_inventory/migration.sql',
  'docs/inventory-development.md',
  'docs/adr/0029-own-production-inventory-inbound.md',
  'docs/adr/0030-landed-cost-allocation.md',
  'docs/adr/0031-incoming-stock-destination.md',
  'docs/adr/0032-availability-band-threshold.md',
  'scripts/verify-phase11.mjs',
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

function sources(paths) {
  return paths.filter((path) => ['.ts', '.tsx', '.js', '.mjs'].includes(extname(path)));
}

const sourcing = (
  await Promise.all(
    sources(await files('packages/backend/src/modules/sourcing')).map((path) =>
      readFile(path, 'utf8'),
    ),
  )
).join('\n');
const procurement = (
  await Promise.all(
    sources(await files('packages/backend/src/modules/procurement')).map((path) =>
      readFile(path, 'utf8'),
    ),
  )
).join('\n');
const inventory = (
  await Promise.all(
    sources(await files('packages/backend/src/modules/inventory')).map((path) =>
      readFile(path, 'utf8'),
    ),
  )
).join('\n');
const api = (
  await Promise.all(sources(await files('apps/api/src')).map((path) => readFile(path, 'utf8')))
).join('\n');
const worker = await readFile(resolve(root, 'apps/worker/src/index.ts'), 'utf8');
const web = (
  await Promise.all(sources(await files('apps/web/src')).map((path) => readFile(path, 'utf8')))
).join('\n');

assert.match(sourcing, /createApiary|listApiaries/u);
assert.match(sourcing, /HarvestBatch|createHarvestBatch/u);
assert.match(sourcing, /createAllocation|BatchAllocation/u);
assert.match(sourcing, /OWN_PRODUCTION/u);
assert.match(sourcing, /SELECTED_SUPPLIER/u);
assert.doesNotMatch(sourcing, /moisture|hmf|diastase|purity|therapeutic|laboratory/iu);

assert.match(procurement, /createSupplier/u);
assert.match(procurement, /createPurchaseOrder/u);
assert.match(procurement, /receiveGoods|createGoodsReceipt/u);
assert.match(procurement, /allocateLandedCost/u);
assert.match(procurement, /runInTransaction/u);
assert.match(procurement, /claimIdempotency|IDEMPOTENCY/u);
assert.match(procurement, /OVER_RECEIPT/u);
assert.match(api, /v1\/admin\/procurement/u);
assert.doesNotMatch(api, /@Public\(\)[\s\S]{0,200}v1\/admin\/procurement/u);

assert.match(inventory, /stockLocation|createLocation/u);
assert.match(inventory, /InventoryItem|applyMovements/u);
assert.match(inventory, /availabilityBand/u);
assert.match(inventory, /reconcile/u);
assert.match(inventory, /stock\.low|lowStock/u);
assert.match(inventory, /FOR UPDATE/u);

assert.doesNotMatch(api, /from\s+['"](?:@honey\/db|@prisma\/|prisma)/u);
assert.doesNotMatch(web, /from\s+['"]@honey\/db['"]/u);
assert.doesNotMatch(api, /allocateLandedCost|availableToSell\(/u);
assert.match(worker, /Phase 2 workspace marker/u);
assert.doesNotMatch(worker, /inventory processor|Worker\(/u);
assert.doesNotMatch(inventory, /acquireReservation|reservation sweeper|StockReservationService/u);
assert.doesNotMatch(web, /AddToCart|add to cart/iu);
assert.doesNotMatch(
  (await files('apps/web/src/app')).join('\n'),
  /admin\/suppliers|admin\/procurement|admin\/inventory/u,
);

for (const path of [
  'packages/backend/src/modules/pricing',
  'apps/web/src/app/[locale]/(storefront)/cart',
  'apps/web/src/app/[locale]/(admin)/admin/suppliers',
]) {
  await assert.rejects(access(resolve(root, path)));
}

const migration = await readFile(
  resolve(
    root,
    'packages/db/prisma/migrations/20260810120000_phase11_sourcing_procurement_inventory/migration.sql',
  ),
  'utf8',
);
assert.doesNotMatch(migration, /DROP TABLE/u);
assert.match(migration, /destination_stock_location_id/u);

const historical = [
  'packages/db/prisma/migrations/20260805231327_initial_foundation/migration.sql',
  'packages/db/prisma/migrations/20260806120000_identity_authorization/migration.sql',
  'packages/db/prisma/migrations/20260806190000_media_storage_invariants/migration.sql',
  'packages/db/prisma/migrations/20260806220000_catalog_content_model/migration.sql',
];
for (const path of historical) {
  const { stdout } = await execute('git', ['diff', '--name-only', 'HEAD', '--', path], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(stdout.trim(), '', `Historical migration ${path} changed.`);
}

const ci = await readFile(resolve(root, '.github/workflows/ci.yml'), 'utf8');
for (const gate of [
  'pnpm phase10:verify',
  'pnpm phase11:verify',
  'phase11.integration.test.ts',
  'sourcing.test.ts',
  'procurement.test.ts',
  'inventory.test.ts',
  'pnpm db:test',
]) {
  assert.ok(ci.includes(gate), `Phase 11 CI is missing ${gate}.`);
}

const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
assert.equal(typeof pkg.scripts['phase11:verify'], 'string');
assert.match(pkg.scripts['api:docker:build'], /honey-api:phase11/u);
assert.match(pkg.scripts['web:docker:build'], /honey-web:phase11/u);

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

const contract = await readFile(
  resolve(root, 'packages/contracts/scripts/check-forbidden.mjs'),
  'utf8',
);
assert.match(contract, /path.startsWith\('\/v1\/admin\/'\)/u);
assert.match(contract, /availabilityBand|publicForbidden/u);

process.stdout.write(
  'Phase 11 sourcing, procurement, and inventory structural verification passed.\n',
);
