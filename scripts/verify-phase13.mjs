import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, readFile, readdir } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const root = process.cwd();
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.mjs']);

const required = [
  'packages/backend/src/modules/checkout/domain/checkout.ts',
  'packages/backend/src/modules/checkout/application/checkout.service.ts',
  'packages/backend/src/modules/checkout/infrastructure/prisma-checkout.repository.ts',
  'packages/backend/src/modules/checkout/checkout.module.ts',
  'packages/backend/src/modules/orders/domain/orders.ts',
  'packages/backend/src/modules/orders/application/orders.service.ts',
  'packages/backend/src/modules/orders/infrastructure/prisma-orders.repository.ts',
  'apps/api/src/modules/checkout/checkout.controller.ts',
  'apps/api/test/phase13.test.ts',
  'packages/backend/test/phase13.integration.test.ts',
  'apps/web/src/components/checkout/checkout-flow.tsx',
  'apps/web/src/components/checkout/checkout.module.css',
  'apps/web/src/components/orders/order-detail.tsx',
  'apps/web/src/components/orders/order-history.tsx',
  'apps/web/src/app/[locale]/(storefront)/checkout/page.tsx',
  'apps/web/src/app/[locale]/(storefront)/orders/page.tsx',
  'apps/web/src/app/[locale]/(storefront)/orders/[number]/page.tsx',
  'apps/web/src/app/api/bff/checkout/_proxy.ts',
  'apps/web/src/app/api/bff/checkout/[checkoutId]/extend/route.ts',
  'apps/web/e2e/checkout.spec.ts',
  'apps/web/e2e/checkout-a11y.spec.ts',
  'docs/security-model.md',
  'scripts/verify-phase13.mjs',
];

for (const path of required) await access(resolve(root, path));

async function files(directory) {
  const output = [];
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
      else output.push(path);
    }
  }
  await visit(resolve(root, directory));
  return output;
}

async function sourceText(directory) {
  const paths = (await files(directory)).filter((path) => sourceExtensions.has(extname(path)));
  return Promise.all(paths.map((path) => readFile(path, 'utf8'))).then((contents) =>
    contents.join('\n'),
  );
}

async function implementationText(directory) {
  const paths = (await files(directory)).filter(
    (path) =>
      sourceExtensions.has(extname(path)) && !/(?:\.test|\.spec)\.[cm]?[jt]sx?$/u.test(path),
  );
  return Promise.all(paths.map((path) => readFile(path, 'utf8'))).then((contents) =>
    contents.join('\n'),
  );
}

async function testText(directory) {
  const paths = (await files(directory)).filter((path) =>
    /(?:\.test|\.spec)\.[cm]?[jt]sx?$/u.test(path),
  );
  return Promise.all(paths.map((path) => readFile(path, 'utf8'))).then((contents) =>
    contents.join('\n'),
  );
}

function operation(document, path, method) {
  const entry = document.paths?.[path];
  assert.ok(entry && typeof entry === 'object', `OpenAPI path ${path} is missing.`);
  const result = entry[method];
  assert.ok(
    result && typeof result === 'object',
    `OpenAPI operation ${method.toUpperCase()} ${path} is missing.`,
  );
  return result;
}

function schemaKeys(value, keys = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) schemaKeys(item, keys);
    return keys;
  }
  if (value === null || typeof value !== 'object') return keys;
  for (const [key, nested] of Object.entries(value)) {
    keys.add(key);
    schemaKeys(nested, keys);
  }
  return keys;
}

const checkoutDomain =
  (await implementationText('packages/backend/src/modules/checkout/domain')) +
  (await implementationText('packages/backend/src/modules/checkout/application'));
const ordersDomain =
  (await implementationText('packages/backend/src/modules/orders/domain')) +
  (await implementationText('packages/backend/src/modules/orders/application'));
const api = await sourceText('apps/api/src');
const apiSecurity = await sourceText('apps/api/src/http/security');
const web = await sourceText('apps/web/src');
const webBff = await sourceText('apps/web/src/app/api/bff');
const webAdmin = await sourceText('apps/web/src/app/[locale]/(admin)');
const checkoutUi = await sourceText('apps/web/src/components/checkout');
const ordersUi = await sourceText('apps/web/src/components/orders');
const backendTests = await testText('packages/backend');
const apiTests = await testText('apps/api');
const webTests = await testText('apps/web/e2e');

// --- Domain / application layer -------------------------------------------

assert.match(checkoutDomain, /RESERVATION_EXPIRED/u);
assert.match(checkoutDomain, /RESERVATION_NOT_ACTIVE|CHECKOUT_NOT_EXTENDABLE/u);
assert.match(checkoutDomain, /PRICE_CHANGED/u);
assert.match(checkoutDomain, /Idempotency|idempotencyKey/u);
assert.match(checkoutDomain, /ownerFor|anonymousId/u);
assert.doesNotMatch(
  checkoutDomain,
  /from\s+['"]@prisma\/client['"]/u,
  'Checkout domain must not import the generated Prisma client (module-boundary violation).',
);
assert.doesNotMatch(
  checkoutDomain,
  /from\s+['"]@honey\/db['"]/u,
  'Checkout domain must not import @honey/db directly.',
);

assert.match(ordersDomain, /HNY-/u);
assert.match(ordersDomain, /PENDING_PAYMENT/u);
assert.match(ordersDomain, /UNPAID/u);
assert.match(ordersDomain, /UNFULFILLED/u);
assert.doesNotMatch(
  ordersDomain,
  /from\s+['"]@prisma\/client['"]/u,
  'Orders domain must not import the generated Prisma client (module-boundary violation).',
);

// The checkout/orders domain never leaks marketplace or lab/medical vocabulary.
const checkoutAndOrdersDomain = checkoutDomain + ordersDomain;
for (const forbidden of [
  'sellerId',
  'vendorId',
  'merchantId',
  'commission',
  'moisture',
  'diastase',
  'hmf',
]) {
  assert.doesNotMatch(
    checkoutAndOrdersDomain,
    new RegExp(`\\b${forbidden}\\b`, 'iu'),
    `Checkout/orders domain must not reference ${forbidden}.`,
  );
}

// --- API layer --------------------------------------------------------------

assert.match(api, /v1\/checkout/u);
assert.match(api, /v1\/orders/u);
assert.match(api, /Cache-Control/u);
assert.match(api, /no-store/u);
assert.match(apiSecurity, /recordTamperingAttempt/u);
assert.match(apiSecurity, /WATCHED_CART_FIELD_TOKENS/u);
assert.match(api, /Idempotency-Key/u);

// --- Storefront web layer ----------------------------------------------------

assert.match(web, /\/checkout/u);
assert.match(web, /\/orders/u);
assert.match(checkoutUi, /reservationExpiresAt|extend/iu);
assert.match(checkoutUi, /csrfCookieName/u);
assert.match(checkoutUi, /idempotency-key|idempotencyKey/iu);
assert.match(ordersUi, /UNPAID|paymentStatus/u);
assert.doesNotMatch(web, /from\s+['"]@honey\/backend['"]/u);
assert.doesNotMatch(web, /from\s+['"]@honey\/db['"]/u);
assert.doesNotMatch(web, /from\s+['"]@prisma\/client['"]/u);
assert.doesNotMatch(webAdmin, /checkout|orders/iu);

assert.match(webBff, /v1\/checkout/u);
assert.match(webBff, /v1\/orders/u);
assert.match(webBff, /csrf|CSRF/u);

// The BFF checkout proxy must forward the CSRF header upstream on every write,
// exactly like the cart proxy does (this is the bug this phase found and fixed).
const checkoutProxy = await readFile(
  resolve(root, 'apps/web/src/app/api/bff/checkout/_proxy.ts'),
  'utf8',
);
assert.match(
  checkoutProxy,
  /headers\.set\(\s*env\.csrfHeaderName/u,
  'Checkout BFF proxy must forward the CSRF header to the upstream API.',
);

const seo = await implementationText('apps/web/src/lib/seo');
assert.doesNotMatch(seo, /HNY-\d/u);

// --- Tests actually assert the required properties --------------------------

assert.match(backendTests, /reservation|RESERVATION/iu);
assert.match(backendTests, /concurrent|Promise\.all/u);
assert.match(backendTests, /HNY-/u);
assert.match(backendTests, /PRICE_CHANGED/u);
assert.match(apiTests, /Idempotency-Key|idempotencyKey/iu);
assert.match(apiTests, /csrf|CSRF/iu);
assert.match(apiTests, /recordTamperingAttempt/u);
assert.match(apiTests, /404/u);
assert.match(webTests, /UNPAID/u);
assert.match(webTests, /HNY-/u);

// --- OpenAPI contract ---------------------------------------------------------

const contract = JSON.parse(
  await readFile(resolve(root, 'packages/contracts/openapi.json'), 'utf8'),
);
for (const [path, method] of [
  ['/v1/checkout', 'post'],
  ['/v1/checkout/{id}', 'get'],
  ['/v1/checkout/{id}/confirm', 'post'],
  ['/v1/checkout/{id}/extend', 'post'],
  ['/v1/orders', 'get'],
  ['/v1/orders/{number}', 'get'],
]) {
  operation(contract, path, method);
}
const startCheckoutOperation = operation(contract, '/v1/checkout', 'post');
assert.ok(
  Array.isArray(startCheckoutOperation.parameters) &&
    startCheckoutOperation.parameters.some(
      (parameter) =>
        parameter !== null &&
        typeof parameter === 'object' &&
        parameter.in === 'header' &&
        parameter.name === 'Idempotency-Key' &&
        parameter.required === true,
    ),
  'POST /v1/checkout must require an Idempotency-Key header.',
);

const checkoutOrdersOperationKeys = schemaKeys({
  '/v1/checkout': contract.paths?.['/v1/checkout'],
  '/v1/checkout/{id}': contract.paths?.['/v1/checkout/{id}'],
  '/v1/checkout/{id}/confirm': contract.paths?.['/v1/checkout/{id}/confirm'],
  '/v1/checkout/{id}/extend': contract.paths?.['/v1/checkout/{id}/extend'],
  '/v1/orders': contract.paths?.['/v1/orders'],
  '/v1/orders/{number}': contract.paths?.['/v1/orders/{number}'],
});
for (const field of [
  'supplier',
  'supplierId',
  'landedCost',
  'unitCost',
  'margin',
  'stockLocation',
  'stockLocationId',
  'warehouse',
  'onHand',
  'availableToSell',
  'reserved',
  'allocated',
  'sellerId',
  'vendorId',
  'merchantId',
  'PAID',
]) {
  assert.ok(!checkoutOrdersOperationKeys.has(field), `Checkout/orders OpenAPI leaks ${field}.`);
}

// --- Migrations ---------------------------------------------------------------

const migrationRoot = resolve(root, 'packages/db/prisma/migrations');
const migrationDirectories = (await readdir(migrationRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const phase13Migrations = migrationDirectories.filter((name) => /phase13/u.test(name));
assert.equal(phase13Migrations.length, 1, 'Phase 13 must add exactly one forward migration.');
const phase13Migration = await readFile(
  resolve(migrationRoot, phase13Migrations[0], 'migration.sql'),
  'utf8',
);
assert.match(phase13Migration, /checkout_session/iu);
assert.match(phase13Migration, /pricing_snapshot|reservation/iu);
assert.doesNotMatch(phase13Migration, /DROP\s+TABLE|ALTER\s+TABLE[\s\S]*DROP\s+COLUMN/iu);

for (const directory of migrationDirectories.filter((name) => !/phase13/u.test(name))) {
  const path = `packages/db/prisma/migrations/${directory}`;
  const { stdout } = await execute('git', ['diff', '--name-only', 'HEAD', '--', path], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(stdout.trim(), '', `Historical migration ${path} changed.`);
}

// The Phase 13 migration must actually be applied to whatever database this
// check is run against, not merely present on disk.
const { stdout: migrateStatus } = await execute(
  'pnpm',
  ['--filter', '@honey/db', 'exec', 'prisma', 'migrate', 'status', '--config', 'prisma.config.ts'],
  { cwd: root, encoding: 'utf8', shell: true },
).catch((error) => ({ stdout: String(error.stdout ?? '') }));
assert.doesNotMatch(
  migrateStatus,
  /have not yet been applied/iu,
  'A Phase 13 (or earlier) migration exists on disk but has not been applied to this database.',
);

// --- Hero assets, env, and git hygiene ----------------------------------------

const heroFiles = [
  'apps/web/public/media/hero/desktop/honey-poster.webp',
  'apps/web/public/media/hero/desktop/honey-scroll.mp4',
  'apps/web/public/media/hero/desktop/honey-scroll.webm',
  'apps/web/public/media/hero/mobile/honey-poster.webp',
  'apps/web/public/media/hero/mobile/honey-scroll.mp4',
  'apps/web/public/media/hero/mobile/honey-scroll.webm',
  'apps/web/public/media/hero/stills/hero-start.webp',
  'apps/web/public/media/hero/stills/hero-end.webp',
];
for (const path of heroFiles) {
  const [{ stdout: actual }, { stdout: expected }] = await Promise.all([
    execute('git', ['hash-object', path], { cwd: root, encoding: 'utf8' }),
    execute('git', ['rev-parse', `HEAD:${path}`], { cwd: root, encoding: 'utf8' }),
  ]);
  assert.equal(actual.trim(), expected.trim(), `Hero asset changed: ${path}`);
}

const { stdout: trackedEnv } = await execute('git', ['ls-files', '.env'], {
  cwd: root,
  encoding: 'utf8',
});
assert.equal(trackedEnv.trim(), '');

const checkoutRoute = resolve(root, 'apps/web/src/app/[locale]/(storefront)/checkout');
const ordersRoute = resolve(root, 'apps/web/src/app/[locale]/(storefront)/orders');
await access(checkoutRoute);
await access(ordersRoute);

const rootPackage = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
assert.equal(typeof rootPackage.scripts['phase13:verify'], 'string');

process.stdout.write('Phase 13 checkout, reservations, and orders structural verification passed.\n');
