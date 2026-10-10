import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, readFile, readdir } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const root = process.cwd();
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.mjs']);

const required = [
  'packages/backend/src/modules/payments/domain/payments.ts',
  'packages/backend/src/modules/payments/application/payments.service.ts',
  'packages/backend/src/modules/payments/infrastructure/prisma-payments.repository.ts',
  'packages/backend/src/modules/payments/infrastructure/providers/fake-payment-provider.ts',
  'packages/backend/src/modules/payments/infrastructure/providers/zarinpal/zarinpal-payment-provider.ts',
  'packages/backend/src/modules/payments/payments.module.ts',
  'apps/api/src/modules/payments/payments.controller.ts',
  'packages/backend/test/payments.test.ts',
  'packages/backend/test/payments.integration.test.ts',
  'packages/backend/test/zarinpal-payment-provider.test.ts',
  'apps/api/test/phase14.test.ts',
  'apps/web/src/components/payments/payment-result.tsx',
  'apps/web/src/app/[locale]/(storefront)/checkout/payment-return/page.tsx',
  'apps/web/src/app/api/bff/payments/_proxy.ts',
  'apps/web/e2e/payments.spec.ts',
  'apps/web/e2e/payments-a11y.spec.ts',
  'docs/payments-development.md',
  'scripts/verify-phase14.mjs',
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

const paymentsDomain =
  (await implementationText('packages/backend/src/modules/payments/domain')) +
  (await implementationText('packages/backend/src/modules/payments/application'));
const paymentsInfra = await implementationText(
  'packages/backend/src/modules/payments/infrastructure',
);
const zarinpal = await readFile(
  resolve(
    root,
    'packages/backend/src/modules/payments/infrastructure/providers/zarinpal/zarinpal-payment-provider.ts',
  ),
  'utf8',
);
const fake = await readFile(
  resolve(
    root,
    'packages/backend/src/modules/payments/infrastructure/providers/fake-payment-provider.ts',
  ),
  'utf8',
);
const api = await sourceText('apps/api/src');
const web = await sourceText('apps/web/src');
const webAdmin = await sourceText('apps/web/src/app/[locale]/(admin)');
const paymentProxy = await readFile(
  resolve(root, 'apps/web/src/app/api/bff/payments/_proxy.ts'),
  'utf8',
);
const backendTests = await testText('packages/backend');
const apiTests = await testText('apps/api');
const webTests = await testText('apps/web/e2e');

assert.match(paymentsDomain, /interface PaymentProvider/u);
assert.match(paymentsDomain, /getStatus\(/u);
assert.match(paymentsDomain, /capabilities/u);
assert.match(paymentsDomain, /function decideTransition/u);
assert.match(paymentsDomain, /async applyPaymentOutcome/u);
assert.equal((paymentsDomain.match(/async applyPaymentOutcome/gu) ?? []).length, 1);
assert.match(paymentsDomain, /AMOUNT_MISMATCH|CURRENCY_MISMATCH|PROVIDER_REF_MISMATCH/u);
assert.match(paymentsDomain, /requireStepUp/u);
assert.doesNotMatch(paymentsDomain, /from\s+['"]@prisma\/client['"]/u);
assert.doesNotMatch(paymentsDomain, /from\s+['"]@honey\/db['"]/u);

assert.match(fake, /class FakePaymentProvider/u);
assert.match(fake, /webhooks/u);
assert.match(zarinpal, /class ZarinpalPaymentProvider/u);
assert.match(zarinpal, /inquiry\.json/u);
assert.match(zarinpal, /verify\.json/u);
assert.match(zarinpal, /partialRefund:\s*false/u);
assert.match(zarinpal, /webhooks:\s*false/u);
assert.doesNotMatch(zarinpal, /stripe|idpay|shaparak/iu);
assert.doesNotMatch(paymentsInfra, /card_pan|cardNumber|cvv/iu);

assert.match(api, /v1\/payments/u);
assert.match(api, /webhooks\/payments/u);
assert.match(api, /Cache-Control.*no-store|private, no-store/u);
assert.match(api, /PAYMENT_CARD_OR_MONEY_FIELD_FORBIDDEN/u);
assert.doesNotMatch(webAdmin, /refund|payment/iu);
assert.match(paymentProxy, /headers\.set\(\s*env\.csrfHeaderName/u);
assert.match(web, /payments\.payNow|t\('payments\.payNow'\)/u);
assert.doesNotMatch(web, /autocomplete=['"]cc-number['"]/u);

assert.match(backendTests, /forged|FAILED after a forged|status=success/iu);
assert.match(backendTests, /AMOUNT_MISMATCH|CURRENCY_MISMATCH|PROVIDER_REF_MISMATCH/u);
assert.match(backendTests, /Promise\.all/u);
assert.match(backendTests, /webhooks:\s*false/u);
assert.match(backendTests, /STEP_UP_REQUIRED|requireStepUp/u);
assert.match(backendTests, /inquiry\.json|request\.json/u);
assert.match(apiTests, /status=success/u);
assert.match(apiTests, /PAYMENT_CARD_OR_MONEY_FIELD_FORBIDDEN/u);
assert.match(apiTests, /STEP_UP_REQUIRED/u);
assert.match(webTests, /status=success/u);
assert.match(webTests, /Pay now/u);
assert.match(webTests, /dir.*rtl|toHaveAttribute\('dir'/u);

const contract = JSON.parse(
  await readFile(resolve(root, 'packages/contracts/openapi.json'), 'utf8'),
);
for (const [path, method] of [
  ['/v1/payments', 'post'],
  ['/v1/payments/{id}', 'get'],
  ['/v1/payments/{id}/return', 'post'],
  ['/v1/admin/payments/{paymentId}/refunds', 'post'],
  ['/webhooks/payments/{provider}', 'post'],
]) {
  operation(contract, path, method);
}

const paymentKeys = JSON.stringify({
  payments: contract.paths?.['/v1/payments'],
  payment: contract.paths?.['/v1/payments/{id}'],
  ret: contract.paths?.['/v1/payments/{id}/return'],
  webhook: contract.paths?.['/webhooks/payments/{provider}'],
});
for (const leaked of [
  'merchantSecret',
  'apiKey',
  'signatureSecret',
  'rawWebhook',
  'rawProviderPayload',
  'cardNumber',
  'card_pan',
  'cvv',
  'merchant_id',
]) {
  assert.doesNotMatch(paymentKeys, new RegExp(leaked, 'u'), `OpenAPI leaked ${leaked}.`);
}

const migrationRoot = resolve(root, 'packages/db/prisma/migrations');
const migrationDirectories = (await readdir(migrationRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const phase14Migrations = migrationDirectories.filter((name) => /phase14/u.test(name));
assert.ok(phase14Migrations.length <= 1, 'Phase 14 may add at most one forward migration.');
for (const directory of migrationDirectories.filter((name) => !/phase14/u.test(name))) {
  const path = `packages/db/prisma/migrations/${directory}`;
  const { stdout } = await execute('git', ['diff', '--name-only', 'HEAD', '--', path], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(stdout.trim(), '', `Historical migration ${path} changed.`);
}

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

const rootPackage = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
assert.equal(typeof rootPackage.scripts['phase14:verify'], 'string');
const ci = await readFile(resolve(root, '.github/workflows/ci.yml'), 'utf8');
assert.match(ci, /phase14:verify/u);
assert.match(ci, /payments\.integration\.test\.ts/u);

process.stdout.write('Phase 14 payments structural verification passed.\n');
