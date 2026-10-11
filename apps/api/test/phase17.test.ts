import type { FastifyInstance } from 'fastify';
import pino from 'pino';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AdminCatalogService,
  AdminIdentityService,
  AdminMediaService,
  AdminOrdersService,
  AdminPaymentsService,
  AdminPricingService,
  ForbiddenAppError,
  IdentityService,
  InventoryService,
  PaymentsService,
  SourcingService,
  UnauthenticatedAppError,
  type AuthenticatedPrincipal,
  type PermissionCode,
} from '@honey/backend';
import { createApiApplication } from '../src/bootstrap/create-application.js';
import { loadApiConfig } from '../src/config/api-config.js';
const id = '018f0000-0000-7000-8000-000000000801';
const csrf = 'b'.repeat(32);
const staff: AuthenticatedPrincipal = {
  userId: id,
  sessionId: '018f0000-0000-7000-8000-000000000802',
  kind: 'STAFF',
  permissions: [
    'catalog:read',
    'content:write',
    'order:read',
    'order:note',
    'customer:read',
    'audit:read',
    'pricing:read',
    'pricing:write',
    'inventory:read',
  ],
};
const sessionCookie = 'honey_session=phase17-staff-test-session';
const headers = { cookie: `${sessionCookie}; csrf_token=${csrf}`, 'x-csrf-token': csrf };
async function app(
  writeMax = '120',
): Promise<{ fastify: FastifyInstance; close: () => Promise<void> }> {
  const application = await createApiApplication({
    config: loadApiConfig({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://api:api@127.0.0.1:5432/api',
      API_RATE_LIMIT_MAX: '1000',
      CART_WRITE_RATE_LIMIT_MAX: writeMax,
    }),
    logger: pino({ level: 'silent' }),
    databaseHealthOverride: { check: async () => undefined },
  });
  await application.init();
  await application.getHttpAdapter().getInstance().ready();
  return { fastify: application.getHttpAdapter().getInstance(), close: () => application.close() };
}
afterEach(() => vi.restoreAllMocks());
describe('Phase 17 API boundaries', () => {
  it('requires the console refund key without changing the legacy refund request contract', async () => {
    vi.spyOn(IdentityService.prototype, 'authenticateSession').mockResolvedValue({
      ...staff,
      permissions: ['order:refund'],
    });
    const refunds = vi
      .spyOn(PaymentsService.prototype, 'requestStaffRefund')
      .mockRejectedValue(new ForbiddenAppError({ code: 'STEP_UP_REQUIRED' }));
    const api = await app();
    try {
      const request = {
        method: 'POST' as const,
        url: `/v1/admin/payments/${id}/refund-requests`,
        headers,
        payload: { reason: 'Console retry test' },
      };
      expect((await api.fastify.inject(request)).statusCode).toBe(422);
      expect(refunds).not.toHaveBeenCalled();
      const response = await api.fastify.inject({
        ...request,
        headers: { ...headers, 'idempotency-key': 'phase17-console-refund-key' },
      });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ code: 'STEP_UP_REQUIRED' });
      expect(refunds).toHaveBeenCalledTimes(1);
    } finally {
      await api.close();
    }
  });
  it('limits mutations per staff account and rereads revoked sessions and permissions on the next request', async () => {
    const authenticate = vi
      .spyOn(IdentityService.prototype, 'authenticateSession')
      .mockResolvedValue(staff);
    const add = vi.spyOn(AdminOrdersService.prototype, 'addNote').mockResolvedValue({
      id,
      body: 'Rate limit note',
      actorUserId: id,
      createdAt: '2026-10-10T12:00:00Z',
    });
    const api = await app('2');
    const request = {
      method: 'POST' as const,
      url: `/v1/admin/orders/${id}/notes`,
      headers,
      payload: { body: 'Rate limit note' },
    };
    try {
      expect((await api.fastify.inject(request)).statusCode).toBe(200);
      expect((await api.fastify.inject(request)).statusCode).toBe(200);
      expect((await api.fastify.inject(request)).statusCode).toBe(429);
      expect(add).toHaveBeenCalledTimes(2);
      authenticate.mockResolvedValueOnce({
        ...staff,
        userId: '018f0000-0000-7000-8000-000000000803',
      });
      expect((await api.fastify.inject(request)).statusCode).toBe(200);
      authenticate.mockResolvedValueOnce({ ...staff, permissions: ['order:read'] });
      expect((await api.fastify.inject(request)).statusCode).toBe(403);
      authenticate.mockRejectedValueOnce(new UnauthenticatedAppError());
      expect((await api.fastify.inject(request)).statusCode).toBe(401);
      expect(add).toHaveBeenCalledTimes(3);
    } finally {
      await api.close();
    }
  });
  it('checks staff kind and the declared permission on every new query, and bounds cursors and limits', async () => {
    const authenticate = vi.spyOn(IdentityService.prototype, 'authenticateSession');
    const empty = { items: [], nextCursor: null };
    vi.spyOn(AdminCatalogService.prototype, 'products').mockResolvedValue(empty);
    vi.spyOn(AdminCatalogService.prototype, 'categories').mockResolvedValue(empty);
    vi.spyOn(AdminCatalogService.prototype, 'collections').mockResolvedValue(empty);
    vi.spyOn(AdminOrdersService.prototype, 'list').mockResolvedValue(empty);
    vi.spyOn(AdminOrdersService.prototype, 'notes').mockResolvedValue(empty);
    vi.spyOn(AdminIdentityService.prototype, 'customers').mockResolvedValue(empty);
    vi.spyOn(AdminIdentityService.prototype, 'audit').mockResolvedValue(empty);
    vi.spyOn(AdminMediaService.prototype, 'list').mockResolvedValue(empty);
    vi.spyOn(AdminPricingService.prototype, 'prices').mockResolvedValue(empty);
    vi.spyOn(AdminPricingService.prototype, 'coupons').mockResolvedValue(empty);
    vi.spyOn(AdminPricingService.prototype, 'taxes').mockResolvedValue(empty);
    vi.spyOn(AdminPaymentsService.prototype, 'list').mockResolvedValue(empty);
    vi.spyOn(InventoryService.prototype, 'listLocationsPage').mockResolvedValue(empty);
    vi.spyOn(SourcingService.prototype, 'listApiariesPage').mockResolvedValue(empty);
    vi.spyOn(SourcingService.prototype, 'listAllocationsPage').mockResolvedValue(empty);
    const routes: readonly Readonly<{ path: string; permission: PermissionCode }>[] = [
      { path: '/v1/admin/catalog/products', permission: 'catalog:read' },
      { path: '/v1/admin/catalog/categories', permission: 'catalog:read' },
      { path: '/v1/admin/catalog/collections', permission: 'catalog:read' },
      { path: '/v1/admin/orders', permission: 'order:read' },
      { path: `/v1/admin/orders/${id}/notes`, permission: 'order:read' },
      { path: `/v1/admin/payments/orders/${id}`, permission: 'order:read' },
      { path: '/v1/admin/customers?q=lookup@example.invalid', permission: 'customer:read' },
      { path: '/v1/admin/audit', permission: 'audit:read' },
      { path: '/v1/admin/media', permission: 'content:write' },
      { path: '/v1/admin/pricing/variant-prices/page', permission: 'pricing:read' },
      { path: '/v1/admin/pricing/coupons/page', permission: 'pricing:read' },
      { path: '/v1/admin/pricing/tax-rates/page', permission: 'pricing:read' },
      { path: '/v1/admin/inventory/locations/page', permission: 'inventory:read' },
      { path: '/v1/admin/sourcing/apiaries/page', permission: 'inventory:read' },
      {
        path: `/v1/admin/sourcing/harvest-batches/${id}/allocations/page`,
        permission: 'inventory:read',
      },
    ];
    const api = await app();
    try {
      for (const route of routes) {
        authenticate.mockRejectedValueOnce(new UnauthenticatedAppError());
        expect(
          (await api.fastify.inject({ method: 'GET', url: route.path })).statusCode,
          route.path,
        ).toBe(401);
        authenticate.mockResolvedValueOnce({
          ...staff,
          kind: 'CUSTOMER',
          permissions: [route.permission],
        });
        expect(
          (await api.fastify.inject({ method: 'GET', url: route.path })).statusCode,
          route.path,
        ).toBe(403);
        authenticate.mockResolvedValueOnce({ ...staff, permissions: [] });
        expect(
          (await api.fastify.inject({ method: 'GET', url: route.path })).statusCode,
          route.path,
        ).toBe(403);
        authenticate.mockResolvedValue(staff);
        const response = await api.fastify.inject({ method: 'GET', url: route.path });
        expect(response.statusCode, route.path).toBe(200);
        expect(response.headers['cache-control']).toBe('private, no-store');
        expect(response.json()).toEqual(empty);
        const separator = route.path.includes('?') ? '&' : '?';
        expect(
          (await api.fastify.inject({ method: 'GET', url: `${route.path}${separator}limit=101` }))
            .statusCode,
          route.path,
        ).toBe(422);
        expect(
          (await api.fastify.inject({ method: 'GET', url: `${route.path}${separator}cursor=bad` }))
            .statusCode,
          route.path,
        ).toBe(422);
        expect(
          (
            await api.fastify.inject({
              method: 'GET',
              url: `${route.path}${separator}unsupported=1`,
            })
          ).statusCode,
          route.path,
        ).toBe(422);
      }
    } finally {
      await api.close();
    }
  });
  it('lets SUPPORT add a bounded internal note while denying shipment, cancellation and refund operations', async () => {
    vi.spyOn(IdentityService.prototype, 'authenticateSession').mockResolvedValue({
      ...staff,
      permissions: ['order:read', 'customer:read', 'order:note'],
    });
    const add = vi.spyOn(AdminOrdersService.prototype, 'addNote').mockResolvedValue({
      id,
      body: 'Internal follow-up',
      actorUserId: id,
      createdAt: '2026-10-10T12:00:00.000Z',
    });
    const api = await app();
    try {
      const path = `/v1/admin/orders/${id}/notes`;
      expect(
        (
          await api.fastify.inject({
            method: 'POST',
            url: path,
            headers: { cookie: sessionCookie },
            payload: { body: 'Internal follow-up' },
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await api.fastify.inject({
            method: 'POST',
            url: path,
            headers,
            payload: { body: 'x'.repeat(2001) },
          })
        ).statusCode,
      ).toBe(422);
      expect(
        (
          await api.fastify.inject({
            method: 'POST',
            url: path,
            headers,
            payload: { body: 'Internal follow-up', grandTotalMinor: '1' },
          })
        ).statusCode,
      ).toBe(422);
      const response = await api.fastify.inject({
        method: 'POST',
        url: path,
        headers,
        payload: { body: 'Internal follow-up' },
      });
      expect(response.statusCode).toBe(200);
      expect(add).toHaveBeenCalledTimes(1);
      for (const url of [
        `/v1/admin/fulfilment/orders/${id}/shipments`,
        `/v1/admin/fulfilment/orders/${id}/cancel`,
        `/v1/admin/payments/${id}/refunds`,
        `/v1/admin/payments/${id}/refund-requests`,
      ])
        expect(
          (await api.fastify.inject({ method: 'POST', url, headers, payload: {} })).statusCode,
        ).toBe(403);
    } finally {
      await api.close();
    }
  });
  it('requires recent identity verification before an authorized price mutation reaches persistence', async () => {
    vi.spyOn(IdentityService.prototype, 'authenticateSession').mockResolvedValue(staff);
    const stepUp = vi
      .spyOn(IdentityService.prototype, 'requireStepUp')
      .mockRejectedValue(new ForbiddenAppError({ code: 'STEP_UP_REQUIRED' }));
    const api = await app();
    try {
      const response = await api.fastify.inject({
        method: 'POST',
        url: '/v1/admin/pricing/variant-prices',
        headers,
        payload: {
          variantId: id,
          amountMinor: '125000',
          currency: 'IRR',
          validFrom: '2026-10-10T12:00:00.000Z',
        },
      });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ code: 'STEP_UP_REQUIRED' });
      expect(stepUp).toHaveBeenCalledWith(staff.sessionId);
    } finally {
      await api.close();
    }
  });
});
