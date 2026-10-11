import assert from 'node:assert/strict';
import { readFile, readdir, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { verifyAdminBoundary } from './lib/verify-admin-boundary.mjs';
const root = process.cwd(),
  execute = promisify(execFile);
const read = (path) => readFile(resolve(root, path), 'utf8');
const git = async (...args) => (await execute('git', args, { cwd: root })).stdout.trim();
async function files(dir) {
  const result = [];
  for (const e of await readdir(resolve(root, dir), { withFileTypes: true })) {
    const p = dir + '/' + e.name;
    if (e.isDirectory()) result.push(...(await files(p)));
    else result.push(p);
  }
  return result;
}
for (const module of ['content', 'reviews', 'notifications'])
  for (const layer of ['application', 'domain', 'infrastructure'])
    assert.ok((await files(`packages/backend/src/modules/${module}/${layer}`)).length > 0);
const proof = async (path, patterns) => {
  const source = await read(path);
  for (const p of patterns) assert.match(source, p, `Missing Phase 18 proof in ${path}`);
  return source;
};
await proof('packages/backend/src/modules/content/domain/content.ts', [
  /contentBlocks/u,
  /PUBLISHED/u,
  /metaTitle/u,
]);
await proof('packages/backend/src/modules/content/application/content.service.ts', [
  /content:publish/u,
  /resolvePublicCatalogAssets/u,
  /locales/u,
  /PUBLISHED/u,
]);
await proof('packages/backend/src/modules/content/infrastructure/prisma-content.repository.ts', [
  /outboxEvent/u,
  /auditLog/u,
  /FOR UPDATE/u,
  /PUBLISHED/u,
]);
await proof(
  'packages/backend/src/modules/orders/infrastructure/prisma-review-purchase.repository.ts',
  [/userId/u, /refundedTotalMinor/u, /PAID/u],
);
await proof('packages/backend/src/modules/reviews/application/reviews.service.ts', [
  /verifyReviewDelivery/u,
  /pending/u,
  /review:moderate/u,
  /moderate/u,
]);
await proof('packages/backend/src/modules/reviews/infrastructure/prisma-reviews.repository.ts', [
  /APPROVED/u,
  /_avg/u,
  /_count/u,
  /RepeatableRead/u,
  /FOR UPDATE/u,
]);
await proof('apps/web/src/lib/seo/builders/product.ts', [
  /aggregate\.count > 0/u,
  /aggregate\.average/u,
]);
await proof('packages/backend/src/modules/notifications/domain/templates.ts', [
  /TEMPLATE_VARIABLES/u,
  /escape/u,
  /dir=/u,
  /lang=/u,
]);
await proof('packages/backend/src/modules/notifications/application/notifications.service.ts', [
  /randomBytes\(32\)/u,
  /hash\(token\)/u,
  /prepareNewsletter/u,
  /notificationForSystem/u,
]);
await proof(
  'packages/backend/src/modules/notifications/infrastructure/prisma-notifications.repository.ts',
  [
    /confirmationExpiresAt/u,
    /confirmationConsumedAt/u,
    /unsubscribeHash/u,
    /UNSUBSCRIBED/u,
    /leaseToken/u,
    /requestId/u,
  ],
);
await proof('packages/backend/src/modules/notifications/infrastructure/smtp-mail-sender.ts', [
  /false/u,
  /throw/u,
]);
await proof('apps/worker/src/runtime.ts', [
  /sendShipmentForSystem/u,
  /sendNewsletterForSystem/u,
  /contentCache/u,
]);
await proof('apps/web/src/lib/api-client/public-action.ts', [
  /private, no-store/u,
  /subscribe/u,
  /confirm/u,
  /unsubscribe/u,
]);
await proof('apps/web/src/middleware.ts', [/no-referrer/u, /newsletter/u, /noindex/u]);
await proof('apps/api/src/http/security/security-hooks.ts', [/verifyCsrf/u, /private, no-store/u]);
await verifyAdminBoundary(root);
const store = 'apps/web/src/app/[locale]/(storefront)';
for (const path of [
  'pages/[slug]/page.tsx',
  'articles/page.tsx',
  'articles/[slug]/page.tsx',
  'faq/page.tsx',
  'newsletter/confirm/page.tsx',
  'newsletter/unsubscribe/page.tsx',
])
  await access(resolve(root, store, path));
for (const path of [
  'content/page.tsx',
  'content/[kind]/[id]/page.tsx',
  'reviews/page.tsx',
  'notifications/page.tsx',
])
  await access(resolve(root, 'apps/web/src/app/[locale]/(admin)/admin/(staff)', path));
await proof('apps/web/src/lib/seo/builders/editorial.ts', [/Article/u, /FAQPage/u, /mainEntity/u]);
await proof('apps/web/src/lib/sitemap/entries.ts', [/allContent/u, /pages/u, /articles/u]);
await proof('packages/backend/test/phase18.integration.test.ts', [
  /resubscription/u,
  /concurrency/u,
  /prohibited/u,
  /newsletter/u,
]);
await proof('apps/api/test/phase18.test.ts', [/CSRF/u, /forged/u, /422/u, /no-store/u]);
await proof('apps/web/e2e/phase18.spec.ts', [
  /AxeBuilder/u,
  /360, 390, 768, 1280, 1920/u,
  /Mailpit/u,
  /aggregateRating/u,
]);
const models = await read('packages/db/prisma/schema.prisma');
for (const model of [
  'Page',
  'Article',
  'FaqItem',
  'ProductReview',
  'NotificationTemplate',
  'NotificationDelivery',
  'NewsletterSubscription',
])
  assert.equal((models.match(new RegExp(`model ${model} \\{`, 'gu')) ?? []).length, 1);
assert.doesNotMatch(
  models,
  /\b(?:sellerId|vendorId|merchantId|moisture|diastase|labVerified|therapeutic)\b/iu,
);
const newSource = (
  await Promise.all(
    (await files('packages/backend/src/modules/content'))
      .concat(
        await files('packages/backend/src/modules/reviews'),
        await files('packages/backend/src/modules/notifications'),
      )
      .filter((p) => p.endsWith('.ts'))
      .map(read),
  )
).join('\n');
assert.doesNotMatch(
  newSource,
  /dangerouslySetInnerHTML|\beval\(|trackingPixel|campaign|reviewImage|sellerId|vendorId/u,
);
for (const path of [
  'apps/web/src/app/[locale]/(admin)/admin/(staff)/analytics/page.tsx',
  'apps/web/src/app/[locale]/(admin)/admin/(staff)/cms/page.tsx',
])
  await assert.rejects(access(resolve(root, path)));
for (const token of [
  'pnpm phase18:verify',
  'pnpm phase18:test:e2e',
  'test/phase18.integration.test.ts',
  'test/phase18.test.ts',
])
  assert.ok((await read('.github/workflows/ci.yml')).includes(token));
assert.equal(await git('diff', '--cached', '--name-only'), '');
assert.equal(await git('ls-files', '.env'), '');
assert.equal(await git('diff', 'HEAD', '--', 'pnpm-lock.yaml'), '');
assert.equal(await git('diff', 'HEAD', '--', 'packages/db/prisma/migrations'), '');
assert.equal(await git('status', '--porcelain', '--', 'apps/web/public/media/hero'), '');
const hero = await files('apps/web/public/media/hero');
assert.equal(hero.length, 8);
for (const path of hero)
  assert.equal(await git('hash-object', path), await git('rev-parse', `HEAD:${path}`));
await proof('scripts/lib/admin-test-storage.mjs', [/assertNoHero/u, /matches !== 0/u]);
process.stdout.write(
  'Phase 18 structural, authorization, privacy, scope and integrity verification passed; 8 Hero hashes unchanged.\n',
);
