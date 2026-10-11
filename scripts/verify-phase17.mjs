import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, readFile, readdir } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import { verifyAdminBoundary } from './lib/verify-admin-boundary.mjs';

const root = process.cwd();
const execute = promisify(execFile);
const read = (path) => readFile(resolve(root, path), 'utf8');
async function git(...args) {
  return (await execute('git', args, { cwd: root, encoding: 'utf8' })).stdout.trim();
}
async function files(directory) {
  const result = [];
  for (const entry of await readdir(resolve(root, directory), { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) result.push(...(await files(path)));
    else result.push(path);
  }
  return result;
}
const staff = 'apps/web/src/app/[locale]/(admin)/admin/(staff)';
const sections = [
  'catalog',
  'media',
  'pricing',
  'inventory',
  'sourcing',
  'procurement',
  'orders',
  'customers',
  'settings',
  'audit',
];
for (const section of sections) await access(resolve(root, `${staff}/${section}/page.tsx`));
await access(resolve(root, 'apps/web/src/app/[locale]/(admin)/admin/sign-in/page.tsx'));
const boundary = await verifyAdminBoundary(root);
assert.equal(boundary.controllers, 17);
assert.equal(boundary.operations, 113);
assert.equal(
  (await files('apps/web/src/app/[locale]/(admin)/admin')).filter((path) =>
    path.endsWith('/page.tsx'),
  ).length,
  22,
);
const layout = await read('apps/web/src/app/[locale]/(admin)/layout.tsx');
assert.match(layout, /index:\s*false/u);
assert.match(layout, /follow:\s*false/u);
const navigation = await read('apps/web/src/lib/admin/navigation.ts');
for (const section of sections) assert.ok(navigation.includes(`path: '${section}'`));
const server = await read('apps/web/src/lib/admin/server.ts');
assert.match(server, /!flag\(user\['isStaff'\]\)/u);
assert.match(server, /no-store/u);
const middleware = await read('apps/web/src/middleware.ts');
assert.match(middleware, /nonce/u);
assert.match(middleware, /private, no-store/u);
const headers = await read('apps/web/src/lib/security-headers.ts');
assert.match(headers, /S3_BROWSER_ENDPOINT/u);
assert.match(headers, /PUBLIC_MEDIA_BASE_URL/u);
assert.match(headers, /nonce-/u);
const security = await read('apps/api/src/http/security/security-hooks.ts');
assert.match(security, /verifyCsrf\(/u);
assert.match(security, /private, no-store/u);
const bff = await read('apps/web/src/lib/admin/bff.ts');
for (const proof of [
  'bodyKeys',
  'query',
  'cookieHeader',
  'csrfToken',
  'idempotency',
  'private, no-store',
  '__proto__',
])
  assert.ok(bff.includes(proof), `Missing BFF proof ${proof}.`);
const bffFiles = await files('apps/web/src/app/api/bff/admin');
assert.equal(bffFiles.length, 104, 'Every explicit admin BFF route must remain present.');
for (const path of bffFiles) {
  assert.doesNotMatch(path, /\[\.{3}/u, 'A catch-all admin proxy is forbidden.');
  const source = await read(path);
  assert.match(source, /adminRoute\(/u);
  assert.doesNotMatch(source, /@honey\/backend|@honey\/db|prisma|request\.url/u);
}
const uiFiles = [
  ...(await files(staff)),
  ...(await files('apps/web/src/components/admin')),
  ...(await files('apps/web/src/lib/admin')),
];
const ui = (
  await Promise.all(uiFiles.filter((path) => /\.(tsx?|css)$/u.test(path)).map(read))
).join('\n');
assert.doesNotMatch(
  ui,
  /@honey\/(?:backend|db)|@prisma|localStorage|sessionStorage|dangerouslySetInnerHTML/u,
);
assert.doesNotMatch(
  ui,
  /\b(?:sellerId|vendorId|merchantId|commission|moisture|diastase|therapeutic|labVerified)\b/iu,
);
assert.doesNotMatch(ui, /@ts-ignore|\bTODO\b|\bas any\b/u);
for (const future of ['analytics', 'cms', 'jobs', 'queues', 'database']) {
  assert.ok(!navigation.includes(`path: '${future}'`));
  await assert.rejects(access(resolve(root, `${staff}/${future}/page.tsx`)));
}
const catalogue = await read('apps/web/src/components/admin/catalog-forms.tsx');
assert.match(catalogue, /\['fa', 'en'\]/u);
assert.match(catalogue, /incomplete/u);
assert.match(
  await read('packages/backend/src/modules/catalog/infrastructure/prisma-catalog.repository.ts'),
  /PRODUCT_PUBLICATION_INCOMPLETE/u,
);
const media = await read('apps/web/src/components/admin/media-controls.tsx');
for (const proof of [
  'upload-intents',
  '/complete',
  "mode: 'cors'",
  "credentials: 'omit'",
  'safeMediaUrl',
])
  assert.ok(media.includes(proof));
const pricing = await read('packages/backend/src/modules/pricing/application/pricing.service.ts');
assert.match(pricing, /requireStepUp/u);
const payments = await read(
  'packages/backend/src/modules/payments/application/payments.service.ts',
);
assert.match(payments, /requireStepUp/u);
assert.match(payments, /findRefundByKey/u);
assert.match(
  await read('apps/web/src/app/api/bff/admin/payments/[paymentId]/refunds/route.ts'),
  /refund-requests/u,
);
assert.match(await read('apps/web/src/components/admin/inventory-forms.tsx'), /expectedVersion/u);
assert.match(
  await read('apps/web/src/components/admin/procurement-forms.tsx'),
  /quantityAccepted/u,
);
assert.match(await read('apps/web/src/components/admin/order-forms.tsx'), /idempotent/u);
const notes = await read('packages/backend/src/modules/orders/application/admin-orders.service.ts');
assert.match(notes, /order:note/u);
assert.match(notes, /appendAudit/u);
const auditRepository = await read(
  'packages/backend/src/modules/identity/infrastructure/prisma-admin-identity.repository.ts',
);
assert.match(auditRepository, /isStaff: false/u);
assert.match(auditRepository, /phoneMasked/u);
assert.doesNotMatch(
  auditRepository,
  /beforeJson|afterJson|secretHash|encryptedSecret|sessionToken/u,
);
const auditRoute = await read('apps/web/src/app/api/bff/admin/audit/route.ts');
assert.match(auditRoute, /export const GET/u);
assert.doesNotMatch(auditRoute, /export const (?:POST|PUT|PATCH|DELETE)/u);
for (const locale of ['fa', 'en']) {
  const copy = await read(`packages/i18n/src/messages/${locale}/admin.ts`);
  assert.match(copy, /AdminMessages/u);
  assert.match(copy, /publicationHelp/u);
}
const browser = await read('apps/web/e2e/admin-console.spec.ts');
for (const proof of [
  'AxeBuilder',
  '360',
  '390',
  '768',
  '1280',
  '1920',
  'bypass',
  'freshStepUp',
  'upload-intents',
  'goodsReceipt',
])
  assert.ok(browser.includes(proof));
const apiTests = await read('apps/api/test/phase17.test.ts');
for (const proof of ['CUSTOMER', '401', '403', '422', '429', 'SUPPORT', 'STEP_UP_REQUIRED'])
  assert.ok(apiTests.includes(proof));
assert.match(await read('packages/backend/test/phase17.integration.test.ts'), /rolls back/u);
const ci = await read('.github/workflows/ci.yml');
for (const command of [
  'pnpm phase17:verify',
  'pnpm phase17:test:e2e',
  'test/phase17.test.ts',
  'test/phase17.integration.test.ts',
  'pnpm test:e2e',
])
  assert.ok(ci.includes(command));
const development = await read('docs/admin-console-development.md');
assert.match(development, /order:note/u);
assert.match(development, /0045|refund/u);
const progress = await read('docs/progress.md');
assert.match(progress, /Phase 17/u);
assert.match(progress, /approved/u);
assert.equal(await git('diff', '--cached', '--name-only'), '', 'Staging must remain empty.');
assert.equal(await git('ls-files', '.env'), '', '.env must remain untracked.');
assert.equal(
  await git('diff', 'HEAD', '--', 'pnpm-lock.yaml'),
  '',
  'No dependency change was authorized.',
);
assert.equal(
  await git('diff', 'HEAD', '--', 'packages/db/prisma/migrations'),
  '',
  'Historical migrations are immutable.',
);
assert.equal(await git('status', '--porcelain', '--', 'apps/web/public/media/hero'), '');
assert.equal(await git('diff', '--stat', 'HEAD', '--', 'apps/web/public/media/hero'), '');
const hero = await files('apps/web/public/media/hero');
assert.equal(hero.length, 8);
for (const path of hero)
  assert.equal(
    await git('hash-object', path),
    await git('rev-parse', `HEAD:${path}`),
    `Hero changed: ${relative(root, resolve(root, path))}`,
  );
process.stdout.write(
  `Phase 17 structural verification passed (${boundary.controllers} STAFF controllers, ${boundary.operations} permission-declared operations, ${bffFiles.length} explicit BFF routes, 8 unchanged Hero assets).\n`,
);
