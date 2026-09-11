import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, readFile, readdir } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const root = process.cwd();

const required = [
  'apps/web/src/app/[locale]/(storefront)/products/page.tsx',
  'apps/web/src/app/[locale]/(storefront)/products/[slug]/page.tsx',
  'apps/web/src/app/[locale]/(storefront)/categories/page.tsx',
  'apps/web/src/app/[locale]/(storefront)/categories/[slug]/page.tsx',
  'apps/web/src/app/[locale]/(storefront)/collections/page.tsx',
  'apps/web/src/app/[locale]/(storefront)/collections/[slug]/page.tsx',
  'apps/web/src/app/[locale]/(storefront)/search/page.tsx',
  'apps/web/src/app/robots.ts',
  'apps/web/src/app/sitemap.xml/route.ts',
  'apps/web/src/app/sitemaps/[locale]/[type]/route.ts',
  'apps/web/src/app/api/bff/revalidate/route.ts',
  'apps/web/src/lib/catalog/api.ts',
  'apps/web/src/lib/catalog/query.ts',
  'apps/web/src/lib/cache/tags.ts',
  'apps/web/src/lib/seo/metadata.ts',
  'apps/web/src/lib/seo/alternates.ts',
  'apps/web/src/lib/seo/robots-policy.ts',
  'apps/web/src/lib/seo/builders/product.ts',
  'apps/web/src/lib/seo/builders/breadcrumb.ts',
  'apps/web/src/lib/seo/builders/collection-page.ts',
  'apps/web/src/lib/seo/builders/index.ts',
  'apps/web/src/lib/sitemap/entries.ts',
  'apps/web/src/lib/sitemap/xml.ts',
  'apps/web/src/components/catalog/catalog-filters.tsx',
  'apps/web/src/components/catalog/catalog-pagination.tsx',
  'apps/web/src/components/catalog/product-card.tsx',
  'apps/web/src/components/catalog/product-gallery.tsx',
  'apps/web/src/components/catalog/json-ld-script.tsx',
  'apps/web/e2e/catalog.spec.ts',
  'apps/web/e2e/performance.spec.ts',
  'docs/storefront-development.md',
  'docs/adr/0028-cursor-pagination-seo.md',
  'scripts/verify-phase10.mjs',
];

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

const heroHashes = {
  'apps/web/public/media/hero/desktop/honey-poster.webp':
    'd5f060d17bf39be23c66800cc59aff68d6380c3a',
  'apps/web/public/media/hero/desktop/honey-scroll.mp4': 'c1b3a44e2bb0c32c86e9670fa61636ace7197e5d',
  'apps/web/public/media/hero/desktop/honey-scroll.webm':
    'f4cb88484282335b41ff3bc24ca73df6bf38a5b0',
  'apps/web/public/media/hero/mobile/honey-poster.webp': 'eab338f000cd4f37e18bcf9840ce1b42af7ec340',
  'apps/web/public/media/hero/mobile/honey-scroll.mp4': '60bc14fcf31e22367eb75db0220bbb2340f850f3',
  'apps/web/public/media/hero/mobile/honey-scroll.webm': '30fbd08cc1b6d2904d1e728916e437e6a96b344f',
  'apps/web/public/media/hero/stills/hero-start.webp': '1fdcb32ca07a0b5eea0dfb5624af0a98f294e175',
  'apps/web/public/media/hero/stills/hero-end.webp': '053f89d733e85cc934c120c8a23626b679e5da58',
};

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
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.next') {
        continue;
      }
      const path = resolve(current, entry.name);
      if (entry.isDirectory()) await visit(path);
      else output.push(path);
    }
  }
  await visit(resolve(root, directory));
  return output;
}

for (const path of required) {
  await access(resolve(root, path));
}

for (const path of heroFiles) {
  await access(resolve(root, path));
  const { stdout } = await execute('git', ['hash-object', path], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(stdout.trim(), heroHashes[path], `Hero asset changed: ${path}`);
}

const pathnames = await readFile(resolve(root, 'packages/i18n/src/pathnames.ts'), 'utf8');
for (const segment of [
  "'/products'",
  "'/categories'",
  "'/collections'",
  "'/search'",
  '/mahsoulat',
  '/dasteha',
  '/majmooeha',
  '/jostoju',
]) {
  assert.ok(pathnames.includes(segment), `pathnames.ts is missing ${segment}`);
}

const catalogApi = await readFile(resolve(root, 'apps/web/src/lib/catalog/api.ts'), 'utf8');
assert.match(catalogApi, /from\s+['"]@honey\/contracts['"]/u);
assert.match(catalogApi, /PRODUCT_SORTS/u);
assert.match(catalogApi, /SEARCH_SORTS/u);
assert.match(catalogApi, /CATALOG_FILTER_KEYS/u);
assert.match(catalogApi, /cursor/u);

const catalogQuery = await readFile(resolve(root, 'apps/web/src/lib/catalog/query.ts'), 'utf8');
assert.match(catalogQuery, /ALLOWED_LIST_KEYS/u);
assert.match(catalogQuery, /ALLOWED_SEARCH_KEYS/u);
assert.match(catalogQuery, /hasCursor/u);
assert.match(catalogQuery, /hasFacets/u);

const webSources = (await files('apps/web/src'))
  .filter((path) => ['.ts', '.tsx', '.js', '.mjs', '.css'].includes(extname(path)))
  .map((path) => relative(root, path).replaceAll('\\', '/'));

const webSourceText = (
  await Promise.all(webSources.map((path) => readFile(resolve(root, path), 'utf8')))
).join('\n');

assert.doesNotMatch(webSourceText, /from\s+['"]@honey\/backend/u);
assert.doesNotMatch(webSourceText, /from\s+['"]@honey\/db/u);
assert.doesNotMatch(webSourceText, /from\s+['"]@prisma\/client/u);

const catalogSources = [
  ...(await files('apps/web/src/components/catalog')),
  ...(await files('apps/web/src/app/[locale]/(storefront)/products')),
  ...(await files('apps/web/src/app/[locale]/(storefront)/categories')),
  ...(await files('apps/web/src/app/[locale]/(storefront)/collections')),
  ...(await files('apps/web/src/app/[locale]/(storefront)/search')),
]
  .filter((path) => ['.ts', '.tsx'].includes(extname(path)))
  .map((path) => relative(root, path).replaceAll('\\', '/'));

const catalogSourceText = (
  await Promise.all(catalogSources.map((path) => readFile(resolve(root, path), 'utf8')))
).join('\n');

for (const [pattern, label] of [
  [/\bstock\b/iu, 'stock'],
  [/\bsupplier\b/iu, 'supplier'],
  [/\bmarketplace\b/iu, 'marketplace'],
  [/\bsellerId\b/u, 'sellerId'],
  [/\bvendorId\b/u, 'vendorId'],
]) {
  assert.doesNotMatch(catalogSourceText, pattern, `Forbidden storefront term: ${label}`);
}

const productBuilder = await readFile(
  resolve(root, 'apps/web/src/lib/seo/builders/product.ts'),
  'utf8',
);
assert.match(productBuilder, /buildProductJsonLd/u);
assert.doesNotMatch(productBuilder, /aggregateRating/u);
assert.doesNotMatch(productBuilder, /\breview\b/u);

const seoBuildersDir = await files('apps/web/src/lib/seo/builders');
const seoBuilderText = (
  await Promise.all(
    seoBuildersDir
      .filter((path) => extname(path) === '.ts' && !path.endsWith('.test.ts'))
      .map((path) => readFile(path, 'utf8')),
  )
).join('\n');
assert.match(seoBuilderText, /buildBreadcrumbListJsonLd/u);
assert.match(seoBuilderText, /buildCollectionPageJsonLd/u);
assert.match(seoBuilderText, /buildItemListJsonLd/u);
assert.doesNotMatch(seoBuilderText, /buildAggregateRatingJsonLd/u);
assert.doesNotMatch(seoBuilderText, /buildReviewJsonLd/u);

const metadata = await readFile(resolve(root, 'apps/web/src/lib/seo/metadata.ts'), 'utf8');
assert.match(metadata, /buildCatalogMetadata/u);
assert.match(metadata, /isIndexingEnabled/u);
assert.match(metadata, /pageRobots/u);

const alternates = await readFile(resolve(root, 'apps/web/src/lib/seo/alternates.ts'), 'utf8');
assert.match(alternates, /buildMetadataAlternates/u);
assert.match(alternates, /x-default/u);

const robotsPolicy = await readFile(resolve(root, 'apps/web/src/lib/seo/robots-policy.ts'), 'utf8');
assert.match(robotsPolicy, /indexingEnabled/u);
assert.match(robotsPolicy, /cursor=/u);
assert.match(robotsPolicy, /sort=/u);

const env = await readFile(resolve(root, 'apps/web/src/lib/env.ts'), 'utf8');
assert.match(env, /WEB_INDEXING_ENABLED/u);
assert.match(env, /WEB_REVALIDATE_SECRET/u);
assert.match(env, /parseBooleanFlag\(\s*['"]WEB_INDEXING_ENABLED['"]/u);

const cacheTags = await readFile(resolve(root, 'apps/web/src/lib/cache/tags.ts'), 'utf8');
assert.match(cacheTags, /ALLOWED_REVALIDATE_SCOPES/u);
assert.match(cacheTags, /resolveRevalidateTags/u);

const revalidateRoute = await readFile(
  resolve(root, 'apps/web/src/app/api/bff/revalidate/route.ts'),
  'utf8',
);
assert.match(revalidateRoute, /revalidateSecret/u);
assert.match(revalidateRoute, /isRevalidateScope/u);
assert.match(revalidateRoute, /resolveRevalidateTags/u);
assert.doesNotMatch(revalidateRoute, /revalidateTag\(request/u);

const sitemapIndex = await readFile(resolve(root, 'apps/web/src/app/sitemap.xml/route.ts'), 'utf8');
assert.match(sitemapIndex, /sitemaps/u);

const sitemapXml = await readFile(resolve(root, 'apps/web/src/lib/sitemap/xml.ts'), 'utf8');
assert.match(sitemapXml, /xhtml:link/u);
assert.match(sitemapXml, /x-default/u);

for (const absent of [
  'apps/web/src/app/[locale]/(storefront)/checkout',
  'apps/web/src/app/[locale]/(admin)/admin/page.tsx',
]) {
  await assert.rejects(access(resolve(root, absent)), undefined, `${absent} must not exist`);
}

assert.doesNotMatch(webSourceText, /\bprocurement\b/iu);
assert.doesNotMatch(webSourceText, /\binventory\b/iu);
assert.doesNotMatch(webSourceText, /\bpurchaseOrder\b/u);
assert.doesNotMatch(webSourceText, /\bstockLedger\b/u);
assert.doesNotMatch(webSourceText, /\bgoodsReceipt\b/u);

const catalogE2e = await readFile(resolve(root, 'apps/web/e2e/catalog.spec.ts'), 'utf8');
assert.match(catalogE2e, /robots/u);
assert.match(catalogE2e, /sitemap/u);
assert.match(catalogE2e, /\/fa/u);
assert.match(catalogE2e, /\/en/u);

const performanceE2e = await readFile(resolve(root, 'apps/web/e2e/performance.spec.ts'), 'utf8');
assert.match(performanceE2e, /performance|LCP|largest-contentful-paint/iu);

const ci = await readFile(resolve(root, '.github/workflows/ci.yml'), 'utf8');
for (const gate of [
  'pnpm phase9:verify',
  'pnpm phase10:verify',
  'pnpm i18n:validate',
  'pnpm stylelint',
  'pnpm test:e2e',
  'pnpm test:e2e:performance',
  'pnpm web:docker:build',
  'validate:hardcoded-copy',
  'playwright install',
]) {
  assert.ok(ci.includes(gate), `Phase 10 CI is missing ${gate}`);
}

const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
assert.equal(typeof pkg.scripts['phase10:verify'], 'string');
assert.equal(typeof pkg.scripts['test:e2e:performance'], 'string');
assert.match(pkg.scripts['web:docker:build'], /honey-web:phase10/u);

const envExample = await readFile(resolve(root, '.env.example'), 'utf8');
assert.match(envExample, /WEB_INDEXING_ENABLED/u);
assert.match(envExample, /WEB_REVALIDATE_SECRET/u);

const adrReadme = await readFile(resolve(root, 'docs/adr/README.md'), 'utf8');
assert.match(adrReadme, /0028-cursor-pagination-seo\.md/u);

const seoStrategy = await readFile(resolve(root, 'docs/seo-strategy.md'), 'utf8');
assert.match(seoStrategy, /ADR-0028|0028-cursor-pagination-seo/u);
assert.match(seoStrategy, /WEB_INDEXING_ENABLED/u);
assert.doesNotMatch(seoStrategy, /Pagination is `\?page=n`/u);

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

process.stdout.write('Phase 10 storefront catalog and SEO structural verification passed.\n');
