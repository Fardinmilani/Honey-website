import pino from 'pino';
import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  ContentService,
  ReviewsService,
  NotificationsService,
  IdentityService,
  UnauthenticatedAppError,
  type AuthenticatedPrincipal,
} from '@honey/backend';
import { createApiApplication } from '../src/bootstrap/create-application.js';
import { loadApiConfig } from '../src/config/api-config.js';
const id = '018f0000-0000-7000-8000-000000001801';
const csrf = 'c'.repeat(32);
const headers = {
  cookie: `honey_session=test-phase18-session; csrf_token=${csrf}`,
  'x-csrf-token': csrf,
};
const staff: AuthenticatedPrincipal = {
  userId: id,
  sessionId: id,
  kind: 'STAFF',
  permissions: ['content:read', 'content:write', 'content:publish', 'review:moderate'],
};
async function app(writeLimit = '100') {
  const instance = await createApiApplication({
    config: loadApiConfig({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://api:api@127.0.0.1:5432/api',
      API_RATE_LIMIT_MAX: '1000',
      CART_WRITE_RATE_LIMIT_MAX: writeLimit,
    }),
    logger: pino({ level: 'silent' }),
    databaseHealthOverride: { check: async () => undefined },
  });
  await instance.init();
  const fastify = instance.getHttpAdapter().getInstance();
  await fastify.ready();
  return { fastify, close: () => instance.close() };
}
afterEach(() => vi.restoreAllMocks());
describe('Phase 18 direct API authorization, CSRF and strict input', () => {
  it('requires the dedicated customer capability and rejects staff on customer review operations', async () => {
    const auth = vi.spyOn(IdentityService.prototype, 'authenticateSession');
    const eligibility = vi
      .spyOn(ReviewsService.prototype, 'eligibility')
      .mockResolvedValue({ eligible: true });
    const api = await app();
    try {
      const url = '/v1/me/reviews/eligibility?productId=' + id;
      auth.mockResolvedValue({ ...staff, kind: 'CUSTOMER', permissions: [] });
      expect((await api.fastify.inject({ method: 'GET', url, headers })).statusCode).toBe(403);
      expect(eligibility).not.toHaveBeenCalled();
      auth.mockResolvedValue({ ...staff, kind: 'CUSTOMER', permissions: ['review:submit'] });
      expect((await api.fastify.inject({ method: 'GET', url, headers })).statusCode).toBe(200);
      expect(eligibility).toHaveBeenCalledOnce();
      auth.mockResolvedValue(staff);
      expect((await api.fastify.inject({ method: 'GET', url, headers })).statusCode).toBe(403);
    } finally {
      await api.close();
    }
  });
  it('denies anonymous, customer and missing permission on all privileged content/review/template paths', async () => {
    const auth = vi.spyOn(IdentityService.prototype, 'authenticateSession');
    const api = await app();
    try {
      const paths = [
        '/v1/admin/content/page',
        '/v1/admin/reviews',
        '/v1/admin/notifications/templates',
      ];
      for (const url of paths) {
        auth.mockRejectedValue(new UnauthenticatedAppError());
        expect((await api.fastify.inject({ method: 'GET', url })).statusCode).toBe(401);
        auth.mockResolvedValue({ ...staff, kind: 'CUSTOMER' });
        expect((await api.fastify.inject({ method: 'GET', url, headers })).statusCode).toBe(403);
        auth.mockResolvedValue({ ...staff, permissions: [] });
        expect((await api.fastify.inject({ method: 'GET', url, headers })).statusCode).toBe(403);
      }
    } finally {
      await api.close();
    }
  });
  it('rejects admin mutations without CSRF, with unknown fields or after per-account limit', async () => {
    vi.spyOn(IdentityService.prototype, 'authenticateSession').mockResolvedValue(staff);
    const create = vi.spyOn(ContentService.prototype, 'create').mockResolvedValue({
      id,
      kind: 'page',
      key: 'origin',
      status: 'DRAFT',
      publishedAt: null,
      updatedAt: new Date().toISOString(),
      translations: [],
    });
    const api = await app('2');
    try {
      const url = '/v1/admin/content/page';
      expect(
        (
          await api.fastify.inject({
            method: 'POST',
            url,
            headers: { cookie: headers.cookie },
            payload: { key: 'origin' },
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await api.fastify.inject({
            method: 'POST',
            url,
            headers,
            payload: { key: 'origin', status: 'PUBLISHED' },
          })
        ).statusCode,
      ).toBe(422);
      expect(create).not.toHaveBeenCalled();
      const ok = await api.fastify.inject({
        method: 'POST',
        url,
        headers,
        payload: { key: 'origin' },
      });
      expect(ok.statusCode).toBe(201);
      expect(ok.headers['cache-control']).toBe('private, no-store');
      expect(
        (await api.fastify.inject({ method: 'POST', url, headers, payload: { key: 'next' } }))
          .statusCode,
      ).toBe(429);
    } finally {
      await api.close();
    }
  });
  it('rejects forged review authority and money and keeps the customer write private', async () => {
    vi.spyOn(IdentityService.prototype, 'authenticateSession').mockResolvedValue({
      ...staff,
      kind: 'CUSTOMER',
      permissions: ['review:submit'],
    });
    const submit = vi.spyOn(ReviewsService.prototype, 'submit').mockResolvedValue({
      id,
      productId: id,
      rating: 5,
      title: 'Taste',
      body: 'Floral',
      locale: 'en',
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    });
    const api = await app();
    try {
      const input = { productId: id, rating: 5, title: 'Taste', body: 'Floral', locale: 'en' };
      for (const authority of [
        { verifiedPurchase: true },
        { userId: id },
        { status: 'APPROVED' },
        { price: 1 },
      ]) {
        const response = await api.fastify.inject({
          method: 'POST',
          url: '/v1/me/reviews',
          headers,
          payload: { ...input, ...authority },
        });
        expect(response.statusCode).toBe(422);
      }
      expect(submit).not.toHaveBeenCalled();
    } finally {
      await api.close();
    }
  });
  it('keeps eligibility separate from public cached reviews and allows public reads without identity', async () => {
    vi.spyOn(IdentityService.prototype, 'authenticateSession').mockResolvedValue({
      ...staff,
      kind: 'CUSTOMER',
      permissions: ['review:submit'],
    });
    vi.spyOn(ReviewsService.prototype, 'eligibility').mockResolvedValue({ eligible: true });
    vi.spyOn(ReviewsService.prototype, 'publicPage').mockResolvedValue({
      items: [],
      nextCursor: null,
      aggregate: null,
    });
    const api = await app();
    try {
      const privateRead = await api.fastify.inject({
        method: 'GET',
        url: '/v1/me/reviews/eligibility?productId=' + id,
        headers,
      });
      expect(privateRead.statusCode).toBe(200);
      expect(privateRead.headers['cache-control']).toBe('private, no-store');
      const publicRead = await api.fastify.inject({
        method: 'GET',
        url: `/v1/products/${id}/reviews?limit=20`,
      });
      expect(publicRead.statusCode).toBe(200);
      expect(publicRead.headers['cache-control']).toContain('public');
      expect(publicRead.json()).toEqual({ items: [], nextCursor: null, aggregate: null });
    } finally {
      await api.close();
    }
  });
  it('newsletter actions are explicit POST, generic and no-store and reject token/consent tampering', async () => {
    vi.spyOn(NotificationsService.prototype, 'subscribe').mockResolvedValue({ accepted: true });
    vi.spyOn(NotificationsService.prototype, 'confirm').mockResolvedValue({ accepted: true });
    const api = await app();
    try {
      expect(
        (
          await api.fastify.inject({
            method: 'GET',
            url: '/v1/newsletter/confirm?token=' + 'x'.repeat(43),
          })
        ).statusCode,
      ).toBe(404);
      const response = await api.fastify.inject({
        method: 'POST',
        url: '/v1/newsletter/subscribe',
        payload: { email: 'reader@example.invalid', locale: 'fa', consent: true },
      });
      expect(response.statusCode).toBe(201);
      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(response.json()).toEqual({ accepted: true });
      expect(
        (
          await api.fastify.inject({
            method: 'POST',
            url: '/v1/newsletter/subscribe',
            payload: { email: 'reader@example.invalid', locale: 'fa', consent: false },
          })
        ).statusCode,
      ).toBe(422);
      expect(
        (
          await api.fastify.inject({
            method: 'POST',
            url: '/v1/newsletter/confirm',
            payload: { token: 'x' },
          })
        ).statusCode,
      ).toBe(422);
    } finally {
      await api.close();
    }
  });
});
