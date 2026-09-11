import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, readFile, readdir } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const root = process.cwd();
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.mjs']);

const required = [
  'packages/backend/src/modules/pricing/domain/money.ts',
  'packages/backend/src/modules/pricing/domain/pricing.ts',
  'packages/backend/src/modules/pricing/application/pricing.service.ts',
  'packages/backend/src/modules/pricing/infrastructure/prisma-pricing.repository.ts',
  'packages/backend/src/modules/pricing/pricing.module.ts',
  'packages/backend/src/modules/cart/domain/cart.ts',
  'packages/backend/src/modules/cart/application/cart.service.ts',
  'packages/backend/src/modules/cart/infrastructure/prisma-cart.repository.ts',
  'packages/backend/src/modules/cart/cart.module.ts',
  'packages/backend/src/modules/pricing/domain/pricing.test.ts',
  'packages/backend/src/modules/cart/application/cart.service.test.ts',
  'packages/backend/test/phase12.integration.test.ts',
  'apps/api/test/phase12.test.ts',
  'docs/cart-pricing-development.md',
  'docs/adr/0033-cart-discount-allocation.md',
  'docs/adr/0034-cart-active-ttl.md',
  'docs/adr/0035-cart-mutation-idempotency-and-owner-locking.md',
  'scripts/verify-phase12.mjs',
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

function model(source, name) {
  const match = source.match(new RegExp(`model\\s+${name}\\s+\\{([\\s\\S]*?)\\n\\}`, 'u'));
  assert.ok(match?.[1], `Prisma model ${name} is missing.`);
  return match[1];
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

const pricing = await sourceText('packages/backend/src/modules/pricing');
const cart = await sourceText('packages/backend/src/modules/cart');
const api = await sourceText('apps/api/src');
const apiSecurity = await sourceText('apps/api/src/http/security');
const web = await sourceText('apps/web/src');
const webBff = await sourceText('apps/web/src/app/api/bff');
const webAdmin = await sourceText('apps/web/src/app/[locale]/(admin)');
const i18n = await sourceText('packages/i18n/src');
const backendTests = await testText('packages/backend');
const apiTests = await testText('apps/api');
const webTests = await testText('apps/web');

assert.match(pricing, /\bbigint\b/u);
assert.match(pricing, /amountMinor/u);
assert.match(pricing, /validFrom/u);
assert.match(pricing, /validTo/u);
assert.match(pricing, /resolveCurrentPrice|resolvePrices/u);
assert.match(pricing, /allocateProportionalDiscount/u);
assert.match(pricing, /resolveTaxRate/u);
assert.match(pricing, /calculateTax/u);
assert.match(pricing, /FREE_SHIPPING/u);
assert.match(pricing, /normalizeCouponCode/u);
assert.doesNotMatch(pricing, /parseFloat|Number\.EPSILON|toFixed\(/u);

assert.match(cart, /CartOwner/u);
assert.match(cart, /anonymousId/u);
assert.match(cart, /userId/u);
assert.match(cart, /expiresAt/u);
assert.match(cart, /merge/u);
assert.match(cart, /availableToSell/u);
assert.match(cart, /PRICE_UNAVAILABLE/u);
assert.match(cart, /QUANTITY_CLAMPED/u);
assert.match(cart, /runInTransaction|transaction/u);
assert.match(cart, /claimAddIdempotency/u);
assert.match(cart, /Idempotency-Key|idempotencyKey/u);
assert.match(cart, /pg_advisory_xact_lock/u);
assert.doesNotMatch(
  cart,
  /StockReservation|ReservationService|CheckoutSession|OrderLine|PaymentAttempt|Shipment|Fulfilment/u,
);
assert.doesNotMatch(cart, /\breserved\b|\ballocated\b|\bonHand\b/u);

const schema = await readFile(resolve(root, 'packages/db/prisma/schema.prisma'), 'utf8');
const cartModel = model(schema, 'Cart');
const cartLineModel = model(schema, 'CartLine');
for (const field of [
  'amount',
  'price',
  'subtotal',
  'discount',
  'tax',
  'total',
  'compareAt',
  'currency',
]) {
  assert.doesNotMatch(cartLineModel, new RegExp(`\\b${field}`, 'iu'), `CartLine stores ${field}.`);
}
assert.match(cartModel, /userId/u);
assert.match(cartModel, /anonymousId/u);
assert.match(cartLineModel, /@@unique\(\[cartId, variantId\]\)/u);

const migrationRoot = resolve(root, 'packages/db/prisma/migrations');
const migrationDirectories = (await readdir(migrationRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const phase12Migrations = migrationDirectories.filter((name) => /phase12/u.test(name));
assert.equal(phase12Migrations.length, 1, 'Phase 12 must add exactly one forward migration.');
const phase12Migration = await readFile(
  resolve(migrationRoot, phase12Migrations[0], 'migration.sql'),
  'utf8',
);
assert.match(phase12Migration, /cart_owner_exclusive|num_nonnulls/u);
assert.match(phase12Migration, /cart_active_user|ACTIVE/u);
assert.match(phase12Migration, /cart_active_anonymous|anonymous_id/u);
assert.match(phase12Migration, /variant_price_current|valid_from/u);
assert.doesNotMatch(phase12Migration, /DROP\s+TABLE|ALTER\s+TABLE[\s\S]*DROP\s+COLUMN/iu);

for (const directory of migrationDirectories.filter((name) => !/phase12/u.test(name))) {
  const path = `packages/db/prisma/migrations/${directory}`;
  const { stdout } = await execute('git', ['diff', '--name-only', 'HEAD', '--', path], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(stdout.trim(), '', `Historical migration ${path} changed.`);
}

assert.match(api, /v1\/cart/u);
assert.match(api, /Cache-Control/u);
assert.match(api, /private, no-store/u);
assert.match(api, /pricing:read/u);
assert.match(api, /pricing:write/u);
assert.match(api, /RequirePermissions/u);
assert.match(apiSecurity, /recordTamperingAttempt/u);
assert.match(cart, /security\.tampering_attempt/u);
assert.match(apiSecurity, /unitPrice|price/u);
assert.match(apiSecurity, /subtotal|total/u);
assert.match(apiSecurity, /WATCHED_CART_FIELD_TOKENS/u);
assert.match(apiSecurity, /['"]discount['"]/u);
assert.match(apiSecurity, /['"]tax['"]/u);
assert.match(apiSecurity, /ValidationAppError/u);
assert.match(apiSecurity, /rate/iu);
assert.match(api, /X-Currency/u);
assert.match(api, /Idempotency-Key/u);

assert.match(web, /\/cart/u);
assert.match(web, /AddToCart|add-to-cart/u);
assert.match(web, /variantId/u);
assert.match(web, /amountMinor/u);
assert.match(webBff, /v1\/cart/u);
assert.match(webBff, /csrf|CSRF/u);
assert.match(webBff, /idempotency/i);
assert.match(i18n, /cart/u);
assert.match(i18n, /\/cart/u);
assert.doesNotMatch(web, /from\s+['"]@honey\/backend['"]/u);
assert.doesNotMatch(web, /from\s+['"]@honey\/db['"]/u);
assert.doesNotMatch(web, /from\s+['"]@prisma\/client['"]/u);
assert.doesNotMatch(webAdmin, /pricing|coupon|tax/iu);

const seo = await implementationText('apps/web/src/lib/seo');
assert.match(seo, /Offer/u);
assert.match(seo, /priceCurrency/u);
assert.match(seo, /availability/u);
assert.doesNotMatch(seo, /availabilityQuantity|supplier|landedCost|unitCost|margin/u);

const catalog = await sourceText('packages/backend/src/modules/catalog');
assert.match(catalog, /currency/u);
assert.match(catalog, /price|resolvePrices/u);

assert.match(backendTests, /allocateProportionalDiscount|finalMerchandiseTotalMinor/u);
assert.match(backendTests, /CartService|cart/iu);
assert.match(backendTests, /concurrent|Promise\.all/u);
assert.match(backendTests, /idempotency/i);
assert.match(backendTests, /reservation/iu);
assert.match(apiTests, /recordTamperingAttempt/u);
assert.match(apiTests, /422/u);
assert.match(apiTests, /csrf|CSRF/u);
assert.match(apiTests, /rate/iu);
assert.match(apiTests, /IDEMPOTENCY_KEY_REQUIRED/u);
assert.match(webTests, /\/fa\/.*cart|\/en\/.*cart|cart.*\/fa|cart.*\/en/iu);
assert.match(webTests, /AxeBuilder|axe/u);

const contract = JSON.parse(
  await readFile(resolve(root, 'packages/contracts/openapi.json'), 'utf8'),
);
for (const [path, method] of [
  ['/v1/cart', 'get'],
  ['/v1/cart/lines', 'post'],
  ['/v1/cart/lines/{lineId}', 'patch'],
  ['/v1/cart/lines/{lineId}', 'delete'],
  ['/v1/cart/coupon', 'post'],
  ['/v1/cart/coupon', 'delete'],
]) {
  operation(contract, path, method);
}
const addCartLineOperation = operation(contract, '/v1/cart/lines', 'post');
assert.ok(
  Array.isArray(addCartLineOperation.parameters) &&
    addCartLineOperation.parameters.some(
      (parameter) =>
        parameter !== null &&
        typeof parameter === 'object' &&
        parameter.in === 'header' &&
        parameter.name === 'Idempotency-Key' &&
        parameter.required === true,
    ),
  'POST /v1/cart/lines must require an Idempotency-Key header.',
);

const cartOperationKeys = schemaKeys({
  '/v1/cart': contract.paths?.['/v1/cart'],
  '/v1/cart/lines': contract.paths?.['/v1/cart/lines'],
  '/v1/cart/lines/{lineId}': contract.paths?.['/v1/cart/lines/{lineId}'],
  '/v1/cart/coupon': contract.paths?.['/v1/cart/coupon'],
});
for (const field of [
  'supplier',
  'supplierId',
  'landedCost',
  'unitCost',
  'margin',
  'availableToSell',
  'stockLocation',
  'warehouse',
  'incoming',
  'reorderPoint',
  'reserved',
  'allocated',
]) {
  assert.ok(!cartOperationKeys.has(field), `Cart OpenAPI leaks ${field}.`);
}

const contractText = await readFile(
  resolve(root, 'packages/contracts/src/generated/api.ts'),
  'utf8',
);
assert.match(contractText, /['"]\/v1\/cart['"]/u);
assert.match(contractText, /amountMinor/u);

const rootPackage = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
assert.equal(typeof rootPackage.scripts['phase12:verify'], 'string');
const ci = await readFile(resolve(root, '.github/workflows/ci.yml'), 'utf8');
for (const gate of [
  'pnpm phase12:verify',
  'pricing.test.ts',
  'cart.service.test.ts',
  'phase12.integration.test.ts',
  'phase12.test.ts',
]) {
  assert.ok(ci.includes(gate), `Phase 12 CI is missing ${gate}.`);
}

const adrReadme = await readFile(resolve(root, 'docs/adr/README.md'), 'utf8');
assert.match(adrReadme, /0033-cart-discount-allocation\.md/u);
assert.match(adrReadme, /0034-cart-active-ttl\.md/u);

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

const phase12Paths = [
  ...(await files('packages/backend/src/modules/cart')),
  ...(await files('packages/backend/src/modules/pricing')),
  ...(await files('apps/api/src/modules/cart')),
  ...(await files('apps/api/src/modules/pricing')),
].filter((path) => sourceExtensions.has(extname(path)));
const phase12Source = (await Promise.all(phase12Paths.map((path) => readFile(path, 'utf8')))).join(
  '\n',
);
assert.doesNotMatch(
  phase12Source,
  /StockReservation|CheckoutSession|OrderLine|PaymentAttempt|Shipment|Fulfilment/u,
);

const cartRoute = resolve(root, 'apps/web/src/app/[locale]/(storefront)/cart');
await access(cartRoute);
await assert.rejects(access(resolve(root, 'apps/web/src/app/[locale]/(storefront)/checkout')));

process.stdout.write('Phase 12 cart and pricing structural verification passed.\n');
