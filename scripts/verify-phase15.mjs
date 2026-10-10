import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, readFile, readdir } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const root = process.cwd();
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.mjs']);

async function git(...args) {
  const { stdout } = await execute('git', args, { cwd: root, encoding: 'utf8' });
  return stdout.trim();
}

async function paths(directory) {
  const result = [];
  async function visit(current) {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        return;
      }
      throw error;
    }
    for (const entry of entries) {
      if (['node_modules', 'dist', '.next', '.turbo', 'coverage'].includes(entry.name)) continue;
      const path = resolve(current, entry.name);
      if (entry.isDirectory()) await visit(path);
      else result.push(path);
    }
  }
  await visit(resolve(root, directory));
  return result;
}

async function source(directory, tests = false) {
  const files = (await paths(directory)).filter((path) => {
    if (!sourceExtensions.has(extname(path))) return false;
    const isTest = /(?:\.test|\.spec)\.[cm]?[jt]sx?$/u.test(path);
    return tests === isTest;
  });
  return (await Promise.all(files.map((path) => readFile(path, 'utf8')))).join('\n');
}

function operation(document, path, method) {
  const entry = document.paths?.[path];
  assert.ok(entry && typeof entry === 'object', `OpenAPI path ${path} is missing.`);
  const result = entry[method];
  assert.ok(result && typeof result === 'object', `${method.toUpperCase()} ${path} is missing.`);
  return result;
}

function publicResponseKeys(document, paths) {
  const result = new Set();
  const visited = new Set();
  function visit(schema) {
    if (schema === null || typeof schema !== 'object') return;
    if (typeof schema.$ref === 'string') {
      const prefix = '#/components/schemas/';
      if (!schema.$ref.startsWith(prefix) || visited.has(schema.$ref)) return;
      visited.add(schema.$ref);
      visit(document.components?.schemas?.[schema.$ref.slice(prefix.length)]);
      return;
    }
    for (const [key, value] of Object.entries(schema.properties ?? {})) {
      result.add(key);
      visit(value);
    }
    visit(schema.items);
    for (const branch of [
      ...(schema.allOf ?? []),
      ...(schema.anyOf ?? []),
      ...(schema.oneOf ?? []),
    ]) {
      visit(branch);
    }
  }
  for (const path of paths) {
    const operations = document.paths?.[path] ?? {};
    for (const operation of Object.values(operations)) {
      for (const [status, response] of Object.entries(operation.responses ?? {})) {
        if (!status.startsWith('2')) continue;
        for (const mediaType of Object.values(response.content ?? {})) visit(mediaType.schema);
      }
    }
  }
  return result;
}

const required = [
  'packages/backend/src/modules/shipping',
  'packages/backend/src/modules/fulfilment/domain/fulfilment.ts',
  'packages/backend/src/modules/fulfilment/application/fulfilment.service.ts',
  'packages/backend/src/modules/fulfilment/infrastructure/prisma-fulfilment.repository.ts',
  'packages/backend/src/modules/fulfilment/infrastructure/smtp-fulfilment-notification.adapter.ts',
  'packages/backend/src/modules/fulfilment/fulfilment.module.ts',
  'packages/backend/src/modules/shipping/domain/manual-flat-rates.test.ts',
  'packages/backend/src/modules/checkout/shipping/application/configured-checkout-shipping-quote.service.test.ts',
  'apps/api/src/modules/shipping/shipping.controller.ts',
  'packages/backend/test/phase15.fulfilment.integration.test.ts',
  'packages/backend/test/phase15.smtp.integration.test.ts',
  'apps/api/test/phase15.test.ts',
  'apps/web/e2e/shipping-fulfilment.spec.ts',
  'docs/shipping-fulfilment-development.md',
  'docs/adr/0039-phase15-physical-fulfilment-and-allocation-release.md',
  'docs/adr/0040-shipment-line-allocation-provenance.md',
  'scripts/verify-phase15.mjs',
];
for (const path of required) await access(resolve(root, path));

const shippingDomain =
  (await source('packages/backend/src/modules/shipping/domain')) +
  (await source('packages/backend/src/modules/shipping/application'));
const shippingInfra = await source('packages/backend/src/modules/shipping/infrastructure');
const fulfilmentDomain =
  (await source('packages/backend/src/modules/fulfilment/domain')) +
  (await source('packages/backend/src/modules/fulfilment/application'));
const fulfilmentInfra = await source('packages/backend/src/modules/fulfilment/infrastructure');
const fulfilmentService = await readFile(
  resolve(root, 'packages/backend/src/modules/fulfilment/application/fulfilment.service.ts'),
  'utf8',
);
const fulfilmentEmail = await readFile(
  resolve(
    root,
    'packages/backend/src/modules/fulfilment/infrastructure/smtp-fulfilment-notification.adapter.ts',
  ),
  'utf8',
);
const appModule = await readFile(resolve(root, 'apps/api/src/app.module.ts'), 'utf8');
const inventory = await source('packages/backend/src/modules/inventory');
const checkout = await source('packages/backend/src/modules/checkout');
const pricing = await source('packages/backend/src/modules/pricing');
const api = await readFile(
  resolve(root, 'apps/api/src/modules/shipping/shipping.controller.ts'),
  'utf8',
);
const fulfilmentApi = await readFile(
  resolve(root, 'apps/api/src/modules/fulfilment/fulfilment.controller.ts'),
  'utf8',
);
const web =
  (await source('apps/web/src/components/checkout')) +
  (await source('apps/web/src/components/orders'));
const backendTests = await source('packages/backend', true);
const apiTests = await readFile(resolve(root, 'apps/api/test/phase15.test.ts'), 'utf8');
const webTests = await readFile(resolve(root, 'apps/web/e2e/shipping-fulfilment.spec.ts'), 'utf8');

assert.match(shippingDomain, /ShippingProvider/u);
assert.match(shippingDomain + shippingInfra, /manual-flat/u);
assert.match(shippingDomain + shippingInfra, /ShippingZone|zoneId/u);
assert.match(shippingDomain + shippingInfra, /ShippingMethod|methodCode/u);
assert.match(shippingDomain + shippingInfra, /ShippingRate|perKgMinor/u);
assert.match(shippingDomain + checkout, /expiresAt/u);
assert.match(shippingDomain + checkout, /PRICE_CHANGED/u);
assert.match(pricing, /coupon\.type === 'FREE_SHIPPING'/u);
assert.match(checkout, /freeShippingApplies/u);
assert.match(checkout, /calculateStandardShippingCharge/u);
assert.doesNotMatch(shippingDomain, /from\s+['"](?:@prisma\/client|@honey\/db)['"]/u);
assert.doesNotMatch(fulfilmentDomain, /from\s+['"](?:@prisma\/client|@honey\/db)['"]/u);

assert.match(fulfilmentDomain + fulfilmentInfra, /ShipmentLineAllocation|shipmentLineAllocation/u);
assert.match(fulfilmentDomain + fulfilmentInfra, /IN_TRANSIT/u);
assert.match(fulfilmentDomain + fulfilmentInfra, /PARTIALLY_FULFILLED/u);
assert.match(inventory, /ALLOCATION_RELEASE/u);
assert.match(inventory, /FULFILMENT/u);
assert.match(fulfilmentDomain + fulfilmentInfra, /idempotenc|Idempotenc/iu);
assert.match(fulfilmentDomain, /FulfilmentNotificationPort/u);
assert.match(fulfilmentService, /sendShipped\(/u);
assert.match(fulfilmentService, /sendDelivered\(/u);
assert.match(fulfilmentEmail, /fulfilmentEmailDelivery\.upsert/u);
assert.match(fulfilmentEmail, /fulfilmentEmailDelivery\.updateMany/u);
assert.match(fulfilmentEmail, /sendMail\(/u);
assert.match(fulfilmentEmail, /notification\.locale === 'fa'/u);
assert.match(appModule, /new SmtpFulfilmentNotificationAdapter\(/u);
assert.match(api, /RequirePermissions/u);
assert.match(api, /v1\/admin\/shipping/u);
assert.match(fulfilmentApi, /RequirePermissions/u);
assert.match(fulfilmentApi, /v1\/admin\/fulfilment/u);
assert.match(web, /shipping|tracking/iu);

assert.match(backendTests, /ALLOCATION_RELEASE/u);
assert.match(backendTests, /FULFILMENT/u);
assert.match(backendTests, /Promise\.all|concurrent/iu);
assert.match(backendTests, /PARTIALLY_FULFILLED/u);
assert.match(backendTests, /Fulfilment email delivery failed/u);
assert.match(backendTests, /attemptCount/u);
assert.match(apiTests, /403|PERMISSION_DENIED|FORBIDDEN/u);
assert.match(apiTests, /404/u);
assert.match(apiTests, /shipping|total/iu);
assert.match(webTests, /shipping|tracking/iu);
assert.match(webTests, /fa|rtl/iu);
assert.match(webTests, /en|ltr/iu);

const contract = JSON.parse(
  await readFile(resolve(root, 'packages/contracts/openapi.json'), 'utf8'),
);
operation(contract, '/v1/checkout/{id}/shipping-selection', 'post');
operation(contract, '/v1/admin/shipping/configuration', 'get');
assert.ok(
  Object.keys(contract.paths ?? {}).some((path) => path.startsWith('/v1/admin/fulfilment/')),
  'OpenAPI is missing staff fulfilment operations.',
);
const publicKeys = publicResponseKeys(contract, [
  '/v1/checkout/{id}',
  '/v1/checkout/{id}/shipping-selection',
  '/v1/orders/{number}',
]);
for (const forbidden of [
  'stockLocationId',
  'stockReservationId',
  'providerPayload',
  'rawPayload',
  'supplierId',
  'sellerId',
  'vendorId',
  'merchantId',
]) {
  assert.ok(!publicKeys.has(forbidden), `Public shipping/order OpenAPI leaks ${forbidden}.`);
}

const schema = await readFile(resolve(root, 'packages/db/prisma/schema.prisma'), 'utf8');
assert.match(schema, /ALLOCATION_RELEASE/u);
assert.match(schema, /model ShipmentLineAllocation/u);
assert.match(schema, /model FulfilmentEmailDelivery/u);
assert.match(schema, /@@unique\(\[shipmentId, eventType\]\)/u);
const migrationDirs = (
  await readdir(resolve(root, 'packages/db/prisma/migrations'), {
    withFileTypes: true,
  })
)
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);
const phase15Migrations = migrationDirs.filter((name) => /phase15/u.test(name));
assert.equal(phase15Migrations.length, 1, 'Phase 15 must have one forward migration.');
const phase15Migration = await readFile(
  resolve(root, 'packages/db/prisma/migrations', phase15Migrations[0], 'migration.sql'),
  'utf8',
);
assert.match(phase15Migration, /fulfilment_email_delivery/u);
assert.match(phase15Migration, /fulfilment_email_delivery_shipment_id_event_type_key/u);
for (const directory of migrationDirs.filter((name) => !/phase15/u.test(name))) {
  const path = `packages/db/prisma/migrations/${directory}`;
  assert.equal(await git('diff', '--name-only', 'HEAD', '--', path), '', `${path} changed.`);
}

const hero = 'apps/web/public/media/hero';
assert.equal(await git('status', '--porcelain', '--', hero), '', 'Hero media changed.');
assert.equal(await git('diff', '--stat', 'HEAD', '--', hero), '', 'Hero media changed.');
assert.equal(await git('ls-files', '.env'), '', '.env is tracked.');
assert.equal(await git('diff', '--cached', '--name-only'), '', 'Staging area is not empty.');
assert.equal(
  await git('status', '--porcelain', '--', 'apps/web/src/app/[locale]/(admin)'),
  '',
  'Phase 17 admin UI changed.',
);

const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
assert.equal(packageJson.scripts['phase15:verify'], 'node scripts/verify-phase15.mjs');
const ci = await readFile(resolve(root, '.github/workflows/ci.yml'), 'utf8');
assert.match(ci, /phase15:verify/u);
assert.match(ci, /manual-flat-rates\.test\.ts/u);
assert.match(ci, /configured-checkout-shipping-quote\.service\.test\.ts/u);
assert.match(ci, /phase15\.fulfilment\.integration\.test\.ts/u);
assert.match(ci, /phase15\.smtp\.integration\.test\.ts/u);
assert.match(ci, /phase15\.test\.ts/u);
const development = await readFile(
  resolve(root, 'docs/shipping-fulfilment-development.md'),
  'utf8',
);
assert.match(development, /directly sends a plain-text email/u);
assert.doesNotMatch(
  development,
  /deliverable of delivered fulfilment emails is not fully operational/u,
);

process.stdout.write('Phase 15 shipping and fulfilment structural verification passed.\n');
