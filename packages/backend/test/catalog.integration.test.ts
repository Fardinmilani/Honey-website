import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { createPrismaClient, type PrismaClient } from '@honey/db';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CatalogService } from '../src/modules/catalog/application/catalog.service.js';
import type {
  CatalogMediaAsset,
  CatalogMediaPort,
} from '../src/modules/catalog/domain/catalog-media.port.js';
import { InMemoryCatalogCache } from '../src/modules/catalog/infrastructure/in-memory-catalog-cache.adapter.js';
import { PrismaCatalogRepository } from '../src/modules/catalog/infrastructure/prisma-catalog.repository.js';
import { RedisCatalogCache } from '../src/modules/catalog/infrastructure/redis-catalog-cache.adapter.js';
import type { AuthenticatedPrincipal } from '../src/modules/identity/index.js';

const execFileAsync = promisify(execFile);
const dbDirectory = fileURLToPath(new URL('../../db/', import.meta.url));
const prismaCli = fileURLToPath(
  new URL('../../db/node_modules/prisma/build/index.js', import.meta.url),
);

type TemporaryDatabase = Readonly<{ adminUrl: string; databaseName: string; databaseUrl: string }>;

class EmptyMediaPort implements CatalogMediaPort {
  async resolvePublicAssets() {
    return [];
  }
}

class FixedMediaPort implements CatalogMediaPort {
  constructor(private readonly assets: readonly CatalogMediaAsset[]) {}

  async resolvePublicAssets(assetIds: readonly string[]) {
    const selected = new Set(assetIds);
    return this.assets.filter((asset) => selected.has(asset.id));
  }
}

async function createTemporaryDatabase(): Promise<TemporaryDatabase> {
  const base = new URL(
    process.env['DATABASE_URL'] ??
      'postgresql://honey_local:replace-with-local-development-password@127.0.0.1:5432/honey_local',
  );
  const databaseName = `honey_catalog_${randomUUID().replaceAll('-', '')}`;
  if (!/^honey_catalog_[a-f0-9]{32}$/u.test(databaseName)) throw new Error('Unsafe database name.');
  const admin = new URL(base);
  admin.pathname = '/postgres';
  const target = new URL(base);
  target.pathname = `/${databaseName}`;
  const client = new Client({
    connectionString: admin.toString(),
    connectionTimeoutMillis: 10_000,
  });
  await client.connect();
  try {
    await client.query(`CREATE DATABASE "${databaseName}" TEMPLATE template0`);
  } finally {
    await client.end();
  }
  return { adminUrl: admin.toString(), databaseName, databaseUrl: target.toString() };
}

async function migrate(databaseUrl: string): Promise<void> {
  await execFileAsync(
    process.execPath,
    [prismaCli, 'migrate', 'deploy', '--config', 'prisma.config.ts'],
    {
      cwd: dbDirectory,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      windowsHide: true,
      timeout: 120_000,
    },
  );
}

async function dropTemporaryDatabase(database: TemporaryDatabase): Promise<void> {
  const client = new Client({
    connectionString: database.adminUrl,
    connectionTimeoutMillis: 10_000,
  });
  await client.connect();
  try {
    await client.query(`DROP DATABASE "${database.databaseName}" WITH (FORCE)`);
  } finally {
    await client.end();
  }
}

describe('catalog on PostgreSQL and Redis', () => {
  let database: TemporaryDatabase;
  let prisma: PrismaClient;
  let repository: PrismaCatalogRepository;
  let catalog: CatalogService;
  const actorId = '018f0000-0000-7000-8000-0000000000c1';
  const principal: AuthenticatedPrincipal = {
    userId: actorId,
    sessionId: '018f0000-0000-7000-8000-0000000000c2',
    kind: 'STAFF',
    permissions: ['catalog:read', 'catalog:write', 'catalog:publish'],
  };
  const metadata = { requestId: 'catalog-integration', clientIp: '192.0.2.20' } as const;

  beforeAll(async () => {
    database = await createTemporaryDatabase();
    await migrate(database.databaseUrl);
    prisma = createPrismaClient({ databaseUrl: database.databaseUrl });
    await prisma.user.create({
      data: {
        id: actorId,
        email: 'catalog-editor@example.invalid',
        preferredLocale: 'fa',
        isStaff: true,
      },
    });
    repository = new PrismaCatalogRepository(database.databaseUrl);
    catalog = new CatalogService(
      {
        enabledLocales: ['fa', 'en'],
        defaultLocale: 'fa',
        cacheTtlSeconds: 60,
        cacheNamespace: 'catalog:test',
        searchQueryMaxLength: 160,
        maximumCategoryDepth: 6,
      },
      repository,
      new InMemoryCatalogCache(),
      new EmptyMediaPort(),
    );
  }, 120_000);

  afterAll(async () => {
    await repository?.close();
    await prisma?.$disconnect();
    if (database !== undefined) await dropTemporaryDatabase(database);
  });

  async function createPublishedProduct(
    categoryId: string,
    suffix: string,
    faName: string,
    enName: string,
  ) {
    const product = await catalog.createProduct(
      principal,
      {
        sku: `PRODUCT-${suffix}`,
        sourcingType: 'OWN_PRODUCTION',
        honeyVarietal: enName,
        originRegion: 'Alborz',
        floralSources: ['mountain flower'],
        sortWeight: Number(suffix),
      },
      metadata,
    );
    expect(product.status).toBe('DRAFT');
    await catalog.assignCategory(principal, product.id, categoryId, true, metadata);
    await catalog.upsertProductTranslation(
      principal,
      product.id,
      {
        locale: 'fa',
        name: faName,
        slug: `${faName}-${suffix}`,
        shortDescription: 'برداشت خوش‌رایحه کوهستان',
        storyHtml: '<p>برداشت آرام کوهستان</p>',
      },
      metadata,
    );
    await catalog.upsertProductTranslation(
      principal,
      product.id,
      {
        locale: 'en',
        name: enName,
        slug: `${enName}-${suffix}`,
        shortDescription: 'A fragrant mountain harvest',
        storyHtml: '<p>A calm mountain harvest</p>',
      },
      metadata,
    );
    let state = await catalog.createVariant(
      principal,
      product.id,
      {
        sku: `HNY-${suffix}-450`,
        netWeightGrams: 450,
        jarSizeLabelKey: 'jar.450g',
        packagingTypeKey: 'packaging.glass',
        weightGramsShipping: 700,
        dimensionsMm: [85, 85, 120],
        position: 0,
      },
      metadata,
    );
    const variant = state.variants[0];
    if (variant === undefined) throw new Error('Created variant missing.');
    await catalog.upsertVariantTranslation(
      principal,
      product.id,
      variant.id,
      { locale: 'fa', name: 'شیشه ۴۵۰ گرمی' },
      metadata,
    );
    await catalog.upsertVariantTranslation(
      principal,
      product.id,
      variant.id,
      { locale: 'en', name: '450 g jar' },
      metadata,
    );
    state = await catalog.updateVariantStatus(
      principal,
      product.id,
      variant.id,
      'PUBLISHED',
      metadata,
    );
    expect(state.variants[0]?.status).toBe('PUBLISHED');
    await catalog.setDefaultVariant(principal, product.id, variant.id, metadata);
    return catalog.transitionProduct(principal, product.id, 'PUBLISHED', metadata);
  }

  it('publishes only complete bilingual products, paginates stably, searches normalized Persian, and records slug history', async () => {
    const category = await catalog.createCategory(principal, null, 0, metadata);
    await catalog.upsertCategoryTranslation(
      principal,
      category.id,
      { locale: 'fa', name: 'عسل کوهستان', slug: 'عسل-کوهستان' },
      metadata,
    );
    await catalog.upsertCategoryTranslation(
      principal,
      category.id,
      { locale: 'en', name: 'Mountain honey', slug: 'mountain-honey' },
      metadata,
    );
    const first = await createPublishedProduct(
      category.id,
      '1',
      'عسل ییلاقی کوهستان',
      'Highland Honey',
    );
    await createPublishedProduct(category.id, '2', 'عسل آویشن کوهستان', 'Thyme Honey');

    const pageOne = await catalog.listProducts({ locale: 'fa', limit: 1, sort: 'sort-weight' });
    const nextCursor = pageOne.page.nextCursor;
    if (nextCursor === null) throw new Error('Expected a second catalog page.');
    const pageTwo = await catalog.listProducts({
      locale: 'fa',
      limit: 1,
      sort: 'sort-weight',
      cursor: nextCursor,
    });
    expect(pageOne.page.hasMore).toBe(true);
    expect(new Set([...pageOne.data, ...pageTwo.data].map((product) => product.id)).size).toBe(2);

    for (const query of [
      'عسل ییلاقی کوهستان',
      'عسل ييلاقي كوهستان',
      'عسل\u200cییلاقی کـوهستان',
      'عسل   ییلاقی   کوهستان',
    ]) {
      const result = await catalog.searchProducts({ locale: 'fa', query });
      expect(result.data.some((product) => product.id === first.id)).toBe(true);
    }
    const english = await catalog.searchProducts({ locale: 'en', query: 'Highland Honey' });
    expect(english.data.some((product) => product.id === first.id)).toBe(true);
    const persianScoped = await catalog.searchProducts({ locale: 'en', query: 'ییلاقی' });
    expect(persianScoped.data).toHaveLength(0);

    await catalog.upsertProductTranslation(
      principal,
      first.id,
      {
        locale: 'en',
        name: 'Highland Honey',
        slug: 'highland-reserve',
        shortDescription: 'A fragrant mountain harvest',
      },
      metadata,
    );
    await catalog.upsertProductTranslation(
      principal,
      first.id,
      {
        locale: 'en',
        name: 'Highland Honey',
        slug: 'highland-reserve',
        shortDescription: 'A fragrant mountain harvest',
      },
      metadata,
    );
    expect(await catalog.resolveProduct('en', 'highland-honey-1')).toEqual({
      kind: 'REDIRECT',
      currentSlug: 'highland-reserve',
    });
    expect(
      await prisma.slugHistory.count({
        where: {
          entityType: 'PRODUCT',
          entityId: first.id,
          locale: 'en',
          oldSlug: 'highland-honey-1',
        },
      }),
    ).toBe(1);

    const stricter = new CatalogService(
      {
        enabledLocales: ['fa', 'en', 'de'],
        defaultLocale: 'fa',
        cacheTtlSeconds: 60,
        cacheNamespace: 'catalog:test:three',
        searchQueryMaxLength: 160,
        maximumCategoryDepth: 6,
      },
      repository,
      new InMemoryCatalogCache(),
      new EmptyMediaPort(),
    );
    await expect(
      stricter.transitionProduct(principal, first.id, 'PUBLISHED', metadata),
    ).rejects.toMatchObject({ code: 'PRODUCT_PUBLICATION_INCOMPLETE' });

    const publicAssetId = randomUUID();
    const privateAssetId = randomUUID();
    await prisma.mediaAsset.createMany({
      data: [
        {
          id: publicAssetId,
          kind: 'IMAGE',
          visibility: 'PUBLIC',
          storageKey: `media/${publicAssetId}/original.jpg`,
          mimeType: 'image/jpeg',
          bytes: 100n,
          width: 100,
          height: 100,
          checksum: 'd'.repeat(64),
          altTextByLocale: { fa: 'عسل', en: 'Honey' },
          createdBy: actorId,
        },
        {
          id: privateAssetId,
          kind: 'IMAGE',
          visibility: 'PRIVATE',
          storageKey: `private/${privateAssetId}/original.jpg`,
          mimeType: 'image/jpeg',
          bytes: 100n,
          width: 100,
          height: 100,
          checksum: 'e'.repeat(64),
          altTextByLocale: { fa: 'خصوصی', en: 'Private' },
          createdBy: actorId,
        },
      ],
    });
    const mediaCatalog = new CatalogService(
      {
        enabledLocales: ['fa', 'en'],
        defaultLocale: 'fa',
        cacheTtlSeconds: 60,
        cacheNamespace: 'catalog:test:media',
        searchQueryMaxLength: 160,
        maximumCategoryDepth: 6,
      },
      repository,
      new InMemoryCatalogCache(),
      new FixedMediaPort([
        {
          id: publicAssetId,
          kind: 'IMAGE',
          width: 100,
          height: 100,
          url: `https://media.example.invalid/media/${publicAssetId}/original.jpg`,
          altTextByLocale: { fa: 'عسل', en: 'Honey' },
        },
      ]),
    );
    const attached = await mediaCatalog.attachMedia(
      principal,
      first.id,
      {
        mediaAssetId: publicAssetId,
        role: 'GALLERY',
        position: 0,
        altTextByLocale: { fa: 'نمای نزدیک شیشه عسل', en: 'Close view of the honey jar' },
      },
      metadata,
    );
    expect(attached.media[0]?.altTextByLocale).toEqual({
      fa: 'نمای نزدیک شیشه عسل',
      en: 'Close view of the honey jar',
    });
    await expect(
      mediaCatalog.attachMedia(
        principal,
        first.id,
        { mediaAssetId: privateAssetId, role: 'GALLERY', position: 1, altTextByLocale: {} },
        metadata,
      ),
    ).rejects.toMatchObject({ code: 'MEDIA_ASSET_NOT_PUBLIC' });
    await expect(
      mediaCatalog.attachMedia(
        principal,
        first.id,
        { mediaAssetId: randomUUID(), role: 'GALLERY', position: 2, altTextByLocale: {} },
        metadata,
      ),
    ).rejects.toMatchObject({ code: 'MEDIA_ASSET_NOT_PUBLIC' });
  }, 60_000);

  it('moves category subtrees, rejects cycles, and creates permanent category and collection redirects', async () => {
    const root = await catalog.createCategory(principal, null, 0, metadata);
    const child = await catalog.createCategory(principal, root.id, 0, metadata);
    const destination = await catalog.createCategory(principal, null, 0, metadata);
    await catalog.upsertCategoryTranslation(
      principal,
      root.id,
      { locale: 'en', name: 'Root', slug: 'root' },
      metadata,
    );
    await catalog.upsertCategoryTranslation(
      principal,
      root.id,
      { locale: 'fa', name: 'ریشه', slug: 'ریشه' },
      metadata,
    );
    await catalog.upsertCategoryTranslation(
      principal,
      child.id,
      { locale: 'en', name: 'Child', slug: 'child' },
      metadata,
    );
    await catalog.upsertCategoryTranslation(
      principal,
      destination.id,
      { locale: 'en', name: 'Destination', slug: 'destination' },
      metadata,
    );
    await catalog.moveCategory(principal, root.id, destination.id, metadata);
    const movedChild = await prisma.category.findUniqueOrThrow({ where: { id: child.id } });
    expect(movedChild.path).toContain(destination.id);
    await expect(
      catalog.moveCategory(principal, destination.id, child.id, metadata),
    ).rejects.toMatchObject({ code: 'CATEGORY_CYCLE' });
    await catalog.upsertCategoryTranslation(
      principal,
      root.id,
      { locale: 'en', name: 'Root', slug: 'root-renamed' },
      metadata,
    );
    expect(await catalog.resolveCategory('en', 'root')).toEqual({
      kind: 'REDIRECT',
      currentSlug: 'root-renamed',
    });

    const collection = await catalog.createCollection(principal, 0, metadata);
    await catalog.upsertCollectionTranslation(
      principal,
      collection.id,
      { locale: 'fa', name: 'برگزیده', slug: 'برگزیده' },
      metadata,
    );
    await catalog.upsertCollectionTranslation(
      principal,
      collection.id,
      { locale: 'en', name: 'Selected', slug: 'selected' },
      metadata,
    );
    await catalog.transitionCollection(principal, collection.id, 'PUBLISHED', metadata);
    await catalog.upsertCollectionTranslation(
      principal,
      collection.id,
      { locale: 'en', name: 'Selected', slug: 'selected-reserve' },
      metadata,
    );
    expect(await catalog.resolveCollection('en', 'selected')).toEqual({
      kind: 'REDIRECT',
      currentSlug: 'selected-reserve',
    });
  });

  it('uses the normalized trigram index on representative search data', async () => {
    const sql = new Client({
      connectionString: database.databaseUrl,
      connectionTimeoutMillis: 10_000,
    });
    await sql.connect();
    try {
      await sql.query('SET enable_seqscan = off');
      const plan = await sql.query<{ 'QUERY PLAN': string }>(
        `EXPLAIN SELECT id FROM product_translation
         WHERE honey_catalog_search_document(name, short_description, description, tasting_notes) % $1`,
        ['عسل ییلاقی کوهستان'],
      );
      expect(plan.rows.map((row) => row['QUERY PLAN']).join('\n')).toContain(
        'product_translation_catalog_search_idx',
      );
    } finally {
      await sql.end();
    }
  });

  it('isolates Redis locales, invalidates tags, and bounds outage fallback', async () => {
    const namespace = `honey:catalog:test:${randomUUID()}`;
    const redis = new RedisCatalogCache(
      process.env['REDIS_URL'] ?? 'redis://127.0.0.1:6379',
      namespace,
    );
    await redis.set('products?locale=fa', { locale: 'fa' }, 30, ['catalog:products']);
    await redis.set('products?locale=en', { locale: 'en' }, 30, ['catalog:products']);
    expect(await redis.get('products?locale=fa')).toEqual({ locale: 'fa' });
    expect(await redis.get('products?locale=en')).toEqual({ locale: 'en' });
    await redis.invalidateTags(['catalog:products']);
    expect(await redis.get('products?locale=fa')).toBeNull();
    await redis.close();

    const unavailable = new RedisCatalogCache('redis://127.0.0.1:6398', `${namespace}:offline`);
    await expect(unavailable.get('public')).resolves.toBeNull();
    await unavailable.close();
  }, 10_000);
});
