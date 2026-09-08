import type { FastifyInstance } from 'fastify';
import pino from 'pino';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  IdentityService,
  InventoryService,
  ProcurementService,
  type AuthenticatedPrincipal,
} from '@honey/backend';
import { createApiApplication } from '../src/bootstrap/create-application.js';
import { loadApiConfig } from '../src/config/api-config.js';

const config = loadApiConfig({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://api:api@127.0.0.1:5432/api',
  REDIS_URL: 'redis://127.0.0.1:6379',
  API_RATE_LIMIT_MAX: '100',
});

const customer: AuthenticatedPrincipal = {
  userId: '018f0000-0000-7000-8000-0000000000f1',
  sessionId: '018f0000-0000-7000-8000-0000000000f2',
  kind: 'CUSTOMER',
  permissions: [],
};

const reader: AuthenticatedPrincipal = {
  userId: '018f0000-0000-7000-8000-0000000000f3',
  sessionId: '018f0000-0000-7000-8000-0000000000f4',
  kind: 'STAFF',
  permissions: ['procurement:read', 'inventory:read'],
};

const writer: AuthenticatedPrincipal = {
  userId: '018f0000-0000-7000-8000-0000000000f5',
  sessionId: '018f0000-0000-7000-8000-0000000000f6',
  kind: 'STAFF',
  permissions: ['procurement:write', 'inventory:adjust', 'procurement:read', 'inventory:read'],
};

const supplier = {
  id: '018f0000-0000-7000-8000-0000000000f7',
  code: 'SUP-TEST',
  legalName: 'Fixture Supply',
  contactName: null,
  email: null,
  phone: null,
  address: null,
  status: 'ACTIVE' as const,
  qualityRating: 3,
  notes: null,
  createdAt: '2026-08-10T00:00:00.000Z',
  updatedAt: '2026-08-10T00:00:00.000Z',
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

describe('Phase 11 admin API authorization', () => {
  it('keeps procurement and inventory admin-only, private, and CSRF-protected', async () => {
    const authentication = vi.spyOn(IdentityService.prototype, 'authenticateSession');
    vi.spyOn(ProcurementService.prototype, 'listSuppliers').mockResolvedValue({
      data: [supplier],
      page: { limit: 24, hasMore: false, nextCursor: null },
    });
    vi.spyOn(ProcurementService.prototype, 'createSupplier').mockResolvedValue(supplier);
    vi.spyOn(InventoryService.prototype, 'adjust').mockResolvedValue({
      id: '018f0000-0000-7000-8000-0000000000f8',
      variantId: '018f0000-0000-7000-8000-000000000033',
      stockLocationId: '018f0000-0000-7000-8000-000000000050',
      onHand: 1,
      reserved: 0,
      allocated: 0,
      incoming: 0,
      reorderPoint: 0,
      safetyStock: 0,
      lowStockAlertActive: false,
      version: 1,
      isSellable: true,
      createdAt: '2026-08-10T00:00:00.000Z',
      updatedAt: '2026-08-10T00:00:00.000Z',
    });
    const api = await app();
    const payload = {
      code: 'SUP-TEST',
      legalName: 'Fixture Supply',
      status: 'ACTIVE',
    };
    try {
      const unauthenticated = await api.fastify.inject({
        method: 'GET',
        url: '/v1/admin/procurement/suppliers',
      });
      expect(unauthenticated.statusCode).toBe(401);

      authentication.mockResolvedValueOnce(customer);
      const customerRead = await api.fastify.inject({
        method: 'GET',
        url: '/v1/admin/procurement/suppliers',
        headers: { cookie: 'honey_session=customer' },
      });
      expect(customerRead.statusCode).toBe(403);

      authentication.mockResolvedValueOnce(reader);
      const readerGet = await api.fastify.inject({
        method: 'GET',
        url: '/v1/admin/procurement/suppliers',
        headers: { cookie: 'honey_session=reader' },
      });
      expect(readerGet.statusCode).toBe(200);
      expect(readerGet.headers['cache-control']).toBe('private, no-store');

      authentication.mockResolvedValueOnce(reader);
      const readerWrite = await api.fastify.inject({
        method: 'POST',
        url: '/v1/admin/procurement/suppliers',
        headers: {
          cookie: `honey_session=reader; csrf_token=${'a'.repeat(32)}`,
          'x-csrf-token': 'a'.repeat(32),
        },
        payload,
      });
      expect(readerWrite.statusCode).toBe(403);

      const missingCsrf = await api.fastify.inject({
        method: 'POST',
        url: '/v1/admin/procurement/suppliers',
        headers: { cookie: 'honey_session=writer' },
        payload,
      });
      expect(missingCsrf.statusCode).toBe(403);

      authentication.mockResolvedValueOnce(writer);
      const created = await api.fastify.inject({
        method: 'POST',
        url: '/v1/admin/procurement/suppliers',
        headers: {
          cookie: `honey_session=writer; csrf_token=${'b'.repeat(32)}`,
          'x-csrf-token': 'b'.repeat(32),
        },
        payload,
      });
      expect(created.statusCode).toBe(201);

      authentication.mockResolvedValueOnce(writer);
      const unknownField = await api.fastify.inject({
        method: 'POST',
        url: '/v1/admin/procurement/suppliers',
        headers: {
          cookie: `honey_session=writer; csrf_token=${'c'.repeat(32)}`,
          'x-csrf-token': 'c'.repeat(32),
        },
        payload: { ...payload, sellerId: 'nope' },
      });
      expect(unknownField.statusCode).toBe(422);

      authentication.mockResolvedValueOnce(writer);
      const malformed = await api.fastify.inject({
        method: 'POST',
        url: '/v1/admin/inventory/adjustments',
        headers: {
          cookie: `honey_session=writer; csrf_token=${'d'.repeat(32)}`,
          'x-csrf-token': 'd'.repeat(32),
        },
        payload: {
          variantId: 'not-a-uuid',
          stockLocationId: '018f0000-0000-7000-8000-000000000050',
          delta: 1,
          reason: 'ADJUSTMENT',
          note: 'test',
        },
      });
      expect(malformed.statusCode).toBe(422);

      authentication.mockResolvedValueOnce(writer);
      const adjusted = await api.fastify.inject({
        method: 'POST',
        url: '/v1/admin/inventory/adjustments',
        headers: {
          cookie: `honey_session=writer; csrf_token=${'e'.repeat(32)}`,
          'x-csrf-token': 'e'.repeat(32),
        },
        payload: {
          variantId: '018f0000-0000-7000-8000-000000000033',
          stockLocationId: '018f0000-0000-7000-8000-000000000050',
          delta: 1,
          reason: 'ADJUSTMENT',
          note: 'authorized adjustment',
        },
      });
      expect(adjusted.statusCode).toBe(201);
      expect(adjusted.headers['cache-control']).toBe('private, no-store');
    } finally {
      await api.close();
    }
  });
});
