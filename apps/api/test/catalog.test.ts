import type { FastifyInstance } from 'fastify';
import pino from 'pino';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CatalogService,
  IdentityService,
  type AdminProduct,
  type AuthenticatedPrincipal,
  type PublicProduct,
} from '@honey/backend';
import { createApiApplication } from '../src/bootstrap/create-application.js';
import { loadApiConfig } from '../src/config/api-config.js';

const config = loadApiConfig({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://api:api@127.0.0.1:5432/api',
  REDIS_URL: 'redis://127.0.0.1:6379',
  API_RATE_LIMIT_MAX: '100',
});

const publicProduct: PublicProduct = {
  id: '018f0000-0000-7000-8000-0000000000d1',
  name: 'Wildflower Honey',
  slug: 'wildflower-honey',
  brandLine: null,
  shortDescription: 'Mountain harvest',
  description: null,
  tastingNotes: 'Floral',
  pairingSuggestions: null,
  storyHtml: '<p>Mountain harvest</p>',
  metaTitle: null,
  metaDescription: null,
  honeyVarietal: 'Wildflower',
  floralSources: ['wildflower'],
  originRegion: 'Alborz',
  originAltitudeBand: null,
  harvestSeason: 'spring',
  publishedAt: '2026-08-06T00:00:00.000Z',
  variants: [],
  media: [],
};

const adminProduct: AdminProduct = {
  id: publicProduct.id,
  status: 'DRAFT',
  publishedAt: null,
  sku: null,
  brandLine: null,
  honeyVarietal: null,
  floralSources: [],
  originRegion: null,
  originAltitudeBand: null,
  harvestSeason: null,
  sourcingType: 'OWN_PRODUCTION',
  apiaryId: null,
  sortWeight: 0,
  primaryCategoryId: null,
  defaultVariantId: null,
  translations: [],
  variants: [],
  categories: [],
  collections: [],
  media: [],
};

const customer: AuthenticatedPrincipal = {
  userId: '018f0000-0000-7000-8000-0000000000d2',
  sessionId: '018f0000-0000-7000-8000-0000000000d3',
  kind: 'CUSTOMER',
  permissions: [],
};

const editor: AuthenticatedPrincipal = {
  userId: '018f0000-0000-7000-8000-0000000000d4',
  sessionId: '018f0000-0000-7000-8000-0000000000d5',
  kind: 'STAFF',
  permissions: ['catalog:read', 'catalog:write'],
};

const publisher: AuthenticatedPrincipal = {
  userId: '018f0000-0000-7000-8000-0000000000d6',
  sessionId: '018f0000-0000-7000-8000-0000000000d7',
  kind: 'STAFF',
  permissions: ['catalog:publish'],
};

async function app(): Promise<Readonly<{ close: () => Promise<void>; fastify: FastifyInstance }>> {
  const application = await createApiApplication({
    config,
    logger: pino({ level: 'silent' }),
    databaseHealthOverride: { check: async () => undefined },
  });
  await application.init();
  await application.getHttpAdapter().getInstance().ready();
  return {
    close: async () => application.close(),
    fastify: application.getHttpAdapter().getInstance(),
  };
}

afterEach(() => vi.restoreAllMocks());

describe('catalog HTTP transport', () => {
  it('serves public reads without a session, resolves locale precedence, and emits cache metadata', async () => {
    vi.spyOn(CatalogService.prototype, 'listProducts').mockResolvedValue({
      data: [publicProduct],
      page: { nextCursor: null, hasMore: false, limit: 24 },
    });
    const api = await app();
    try {
      const response = await api.fastify.inject({
        method: 'GET',
        url: '/v1/catalog/products?locale=en',
        headers: { 'accept-language': 'fa' },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ meta: { locale: 'en' } });
      expect(response.headers['cache-control']).toContain('stale-while-revalidate=300');
      expect(response.headers['vary']).toBe('Accept-Language');
      const body = response.body;
      expect(body).not.toMatch(/sourcingType|apiaryId|supplier|price|stock|storageKey/u);
    } finally {
      await api.close();
    }
  });

  it('rejects unsupported explicit locales and unknown or deferred filters', async () => {
    const api = await app();
    try {
      const unsupported = await api.fastify.inject({
        method: 'GET',
        url: '/v1/catalog/products?locale=de',
      });
      expect(unsupported.statusCode).toBe(422);
      const unknown = await api.fastify.inject({
        method: 'GET',
        url: '/v1/catalog/products?priceMin=10',
      });
      expect(unknown.statusCode).toBe(422);
      const stock = await api.fastify.inject({
        method: 'GET',
        url: '/v1/catalog/products?stock=true',
      });
      expect(stock.statusCode).toBe(422);
    } finally {
      await api.close();
    }
  });

  it('returns the binding permanent redirect and canonical versioned API location for old slugs', async () => {
    vi.spyOn(CatalogService.prototype, 'resolveProduct').mockResolvedValue({
      kind: 'REDIRECT',
      currentSlug: 'wildflower-reserve',
    });
    const api = await app();
    try {
      const response = await api.fastify.inject({
        method: 'GET',
        url: '/v1/catalog/products/old-slug?locale=en',
      });
      expect(response.statusCode).toBe(301);
      expect(response.headers['location']).toBe(
        '/v1/catalog/products/wildflower-reserve?locale=en',
      );
    } finally {
      await api.close();
    }
  });

  it('rejects customers, requires CSRF, lets catalog:write edit, and does not let it publish', async () => {
    const authentication = vi.spyOn(IdentityService.prototype, 'authenticateSession');
    vi.spyOn(CatalogService.prototype, 'createProduct').mockResolvedValue(adminProduct);
    vi.spyOn(CatalogService.prototype, 'transitionProduct').mockResolvedValue({
      ...adminProduct,
      status: 'PUBLISHED',
      publishedAt: '2026-08-06T00:00:00.000Z',
    });
    const api = await app();
    const payload = { sourcingType: 'OWN_PRODUCTION' };
    try {
      authentication.mockResolvedValueOnce(customer);
      const customerResponse = await api.fastify.inject({
        method: 'POST',
        url: '/v1/admin/catalog/products',
        headers: {
          cookie: 'honey_session=customer; csrf_token=a'.concat('a'.repeat(31)),
          'x-csrf-token': 'a'.repeat(32),
        },
        payload,
      });
      expect(customerResponse.statusCode).toBe(403);

      const missingCsrf = await api.fastify.inject({
        method: 'POST',
        url: '/v1/admin/catalog/products',
        headers: { cookie: 'honey_session=editor' },
        payload,
      });
      expect(missingCsrf.statusCode).toBe(403);

      authentication.mockResolvedValueOnce(editor);
      const edited = await api.fastify.inject({
        method: 'POST',
        url: '/v1/admin/catalog/products',
        headers: {
          cookie: `honey_session=editor; csrf_token=${'b'.repeat(32)}`,
          'x-csrf-token': 'b'.repeat(32),
        },
        payload,
      });
      expect(edited.statusCode).toBe(201);
      expect(edited.headers['cache-control']).toBe('private, no-store');

      authentication.mockResolvedValueOnce(editor);
      const publish = await api.fastify.inject({
        method: 'POST',
        url: `/v1/admin/catalog/products/${publicProduct.id}/publish`,
        headers: {
          cookie: `honey_session=editor; csrf_token=${'c'.repeat(32)}`,
          'x-csrf-token': 'c'.repeat(32),
        },
      });
      expect(publish.statusCode).toBe(403);

      authentication.mockResolvedValueOnce(editor);
      const variantPublish = await api.fastify.inject({
        method: 'POST',
        url: `/v1/admin/catalog/products/${publicProduct.id}/variants/018f0000-0000-7000-8000-0000000000d8/publish`,
        headers: {
          cookie: `honey_session=editor; csrf_token=${'e'.repeat(32)}`,
          'x-csrf-token': 'e'.repeat(32),
        },
      });
      expect(variantPublish.statusCode).toBe(403);

      authentication.mockResolvedValueOnce(publisher);
      const published = await api.fastify.inject({
        method: 'POST',
        url: `/v1/admin/catalog/products/${publicProduct.id}/publish`,
        headers: {
          cookie: `honey_session=publisher; csrf_token=${'f'.repeat(32)}`,
          'x-csrf-token': 'f'.repeat(32),
        },
      });
      expect(published.statusCode).toBe(200);
    } finally {
      await api.close();
    }
  });

  it('rejects client-controlled publication and audit fields as unknown DTO properties', async () => {
    vi.spyOn(IdentityService.prototype, 'authenticateSession').mockResolvedValue(editor);
    const api = await app();
    try {
      const response = await api.fastify.inject({
        method: 'POST',
        url: '/v1/admin/catalog/products',
        headers: {
          cookie: `honey_session=editor; csrf_token=${'d'.repeat(32)}`,
          'x-csrf-token': 'd'.repeat(32),
        },
        payload: {
          sourcingType: 'OWN_PRODUCTION',
          publishedAt: '2026-08-06T00:00:00.000Z',
          createdBy: publicProduct.id,
        },
      });
      expect(response.statusCode).toBe(422);
    } finally {
      await api.close();
    }
  });
});
