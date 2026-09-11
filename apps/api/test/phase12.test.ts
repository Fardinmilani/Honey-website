import type { FastifyInstance } from 'fastify';
import pino from 'pino';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CartService,
  IdentityService,
  NotFoundAppError,
  PricingService,
  type AuthenticatedPrincipal,
  type CartView,
  type TaxRateRecord,
  type VariantPriceRecord,
} from '@honey/backend';
import { createApiApplication } from '../src/bootstrap/create-application.js';
import { loadApiConfig, type ApiConfig } from '../src/config/api-config.js';

const cartId = '018f0000-0000-7000-8000-000000000061';
const anonymousCartId = '018f0000-0000-7000-8000-000000000062';
const variantId = '018f0000-0000-7000-8000-000000000063';
const csrfToken = 'a'.repeat(32);

const customer: AuthenticatedPrincipal = {
  userId: '018f0000-0000-7000-8000-000000000064',
  sessionId: '018f0000-0000-7000-8000-000000000065',
  kind: 'CUSTOMER',
  permissions: [],
};

const pricingReader: AuthenticatedPrincipal = {
  userId: '018f0000-0000-7000-8000-000000000066',
  sessionId: '018f0000-0000-7000-8000-000000000067',
  kind: 'STAFF',
  permissions: ['pricing:read'],
};

const pricingWriter: AuthenticatedPrincipal = {
  userId: '018f0000-0000-7000-8000-000000000068',
  sessionId: '018f0000-0000-7000-8000-000000000069',
  kind: 'STAFF',
  permissions: ['pricing:write'],
};

const cartView: CartView = {
  id: cartId,
  locale: 'fa',
  currency: 'IRR',
  expiresAt: '2026-10-11T00:00:00.000Z',
  lines: [],
  coupon: null,
  subtotal: { amountMinor: '0', currency: 'IRR' },
  discountTotal: { amountMinor: '0', currency: 'IRR' },
  tax: { state: 'UNRESOLVED', amount: null },
  merchandiseTotal: { amountMinor: '0', currency: 'IRR' },
  adjustments: [],
};

const taxRate: TaxRateRecord = {
  id: '018f0000-0000-7000-8000-000000000070',
  code: 'IR_STANDARD',
  rateBps: 900,
  country: 'IR',
  region: null,
  isInclusive: false,
  isActive: true,
};

const price: VariantPriceRecord = {
  id: '018f0000-0000-7000-8000-000000000071',
  variantId,
  currency: 'IRR',
  amountMinor: 125_000n,
  compareAtMinor: null,
  validFrom: new Date('2026-09-01T00:00:00.000Z'),
  validTo: null,
};

function config(overrides: Readonly<Record<string, string>> = {}): ApiConfig {
  return loadApiConfig({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://api:api@127.0.0.1:5432/api',
    REDIS_URL: 'redis://127.0.0.1:6379',
    API_RATE_LIMIT_MAX: '100',
    ...overrides,
  });
}

async function app(
  apiConfig: ApiConfig = config(),
): Promise<Readonly<{ close: () => Promise<void>; fastify: FastifyInstance }>> {
  const application = await createApiApplication({
    config: apiConfig,
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

function anonymousCookies(token = csrfToken): string {
  return `honey_cart=${anonymousCartId}; csrf_token=${token}`;
}

function csrfHeaders(token = csrfToken): Readonly<Record<string, string>> {
  return {
    cookie: anonymousCookies(token),
    'idempotency-key': 'cart-add-test-key-0001',
    'x-csrf-token': token,
  };
}

afterEach(() => vi.restoreAllMocks());

describe('Phase 12 cart HTTP security', () => {
  it('bootstraps anonymous cart and CSRF cookies and keeps cart responses private', async () => {
    const getCart = vi.spyOn(CartService.prototype, 'getCart').mockResolvedValue(cartView);
    const api = await app();
    try {
      const response = await api.fastify.inject({ method: 'GET', url: '/v1/cart' });

      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(response.headers['vary']).toBe('Accept-Language, X-Currency, Cookie');
      expect(response.headers['x-currency']).toBe('IRR');
      expect(String(response.headers['set-cookie'])).toContain('honey_cart=');
      expect(String(response.headers['set-cookie'])).toContain('csrf_token=');
      expect(getCart).toHaveBeenCalledWith(
        expect.objectContaining({ userId: null, locale: 'fa', currency: 'IRR' }),
      );
    } finally {
      await api.close();
    }
  });

  it('rejects missing and mismatched CSRF tokens before anonymous cart writes', async () => {
    const addLine = vi
      .spyOn(CartService.prototype, 'addLineWithIdempotency')
      .mockResolvedValue({ cart: cartView, replayed: false });
    const api = await app();
    const payload = { variantId, quantity: 1 };
    try {
      const missing = await api.fastify.inject({
        method: 'POST',
        url: '/v1/cart/lines',
        headers: { cookie: `honey_cart=${anonymousCartId}` },
        payload,
      });
      expect(missing.statusCode).toBe(403);
      expect(missing.json()).toMatchObject({ code: 'CSRF_TOKEN_INVALID', status: 403 });

      const mismatched = await api.fastify.inject({
        method: 'POST',
        url: '/v1/cart/lines',
        headers: {
          cookie: anonymousCookies(),
          'x-csrf-token': 'b'.repeat(32),
        },
        payload,
      });
      expect(mismatched.statusCode).toBe(403);
      expect(mismatched.json()).toMatchObject({ code: 'CSRF_TOKEN_INVALID', status: 403 });
      expect(addLine).not.toHaveBeenCalled();
    } finally {
      await api.close();
    }
  });

  it('accepts a valid anonymous write and derives ownership context from cookies rather than payload', async () => {
    const addLine = vi
      .spyOn(CartService.prototype, 'addLineWithIdempotency')
      .mockResolvedValue({ cart: cartView, replayed: false });
    const authenticate = vi.spyOn(IdentityService.prototype, 'authenticateSession');
    const api = await app();
    try {
      const clientOwned = await api.fastify.inject({
        method: 'POST',
        url: '/v1/cart/lines',
        headers: csrfHeaders(),
        payload: { variantId, quantity: 1, userId: customer.userId },
      });
      expect(clientOwned.statusCode).toBe(422);
      expect(addLine).not.toHaveBeenCalled();

      const anonymousResponse = await api.fastify.inject({
        method: 'POST',
        url: '/v1/cart/lines',
        headers: csrfHeaders(),
        payload: { variantId, quantity: 1 },
      });
      expect(anonymousResponse.statusCode).toBe(200);
      expect(addLine).toHaveBeenNthCalledWith(
        1,
        {
          userId: null,
          anonymousId: anonymousCartId,
          locale: 'fa',
          currency: 'IRR',
        },
        { variantId, quantity: 1 },
        'cart-add-test-key-0001',
      );

      authenticate.mockResolvedValue(customer);
      const authenticatedResponse = await api.fastify.inject({
        method: 'POST',
        url: '/v1/cart/lines',
        headers: {
          ...csrfHeaders(),
          cookie: `honey_session=server-session; ${anonymousCookies()}`,
        },
        payload: { variantId, quantity: 1 },
      });
      expect(authenticatedResponse.statusCode).toBe(200);
      expect(authenticatedResponse.headers['cache-control']).toBe('private, no-store');
      expect(addLine).toHaveBeenNthCalledWith(
        2,
        {
          userId: customer.userId,
          anonymousId: anonymousCartId,
          locale: 'fa',
          currency: 'IRR',
        },
        { variantId, quantity: 1 },
        'cart-add-test-key-0001',
      );
    } finally {
      await api.close();
    }
  });

  it('requires an idempotency key before an incrementing cart add', async () => {
    const addLine = vi
      .spyOn(CartService.prototype, 'addLineWithIdempotency')
      .mockResolvedValue({ cart: cartView, replayed: false });
    const api = await app();
    try {
      const response = await api.fastify.inject({
        method: 'POST',
        url: '/v1/cart/lines',
        headers: {
          cookie: anonymousCookies(),
          'x-csrf-token': csrfToken,
        },
        payload: { variantId, quantity: 1 },
      });
      expect(response.statusCode).toBe(422);
      expect(response.json()).toMatchObject({
        code: 'VALIDATION_FAILED',
        errors: [{ path: 'idempotencyKey', code: 'IDEMPOTENCY_KEY_REQUIRED' }],
      });
      expect(addLine).not.toHaveBeenCalled();
    } finally {
      await api.close();
    }
  });

  it.each(['price', 'total', 'stockQuantity', 'availableToSell'])(
    'rejects a %s field with 422 and records only its name for audit',
    async (offendingField) => {
      const addLine = vi
        .spyOn(CartService.prototype, 'addLineWithIdempotency')
        .mockResolvedValue({ cart: cartView, replayed: false });
      const recordTamperingAttempt = vi
        .spyOn(CartService.prototype, 'recordTamperingAttempt')
        .mockResolvedValue(undefined);
      const api = await app();
      try {
        const response = await api.fastify.inject({
          method: 'POST',
          url: '/v1/cart/lines',
          headers: csrfHeaders(),
          payload: { variantId, quantity: 1, [offendingField]: '125000' },
        });
        expect(response.statusCode).toBe(422);
        expect(response.json()).toMatchObject({
          code: 'VALIDATION_FAILED',
          status: 422,
          errors: [{ path: offendingField, code: 'CART_MONEY_FIELD_FORBIDDEN' }],
        });
        expect(response.body).not.toContain('125000');
        expect(addLine).not.toHaveBeenCalled();
        expect(recordTamperingAttempt).toHaveBeenCalledWith(
          expect.objectContaining({
            actorUserId: null,
            anonymousId: anonymousCartId,
            offendingField,
          }),
        );
      } finally {
        await api.close();
      }
    },
  );

  it('records a deeply nested authoritative money field as a tampering attempt', async () => {
    const addLine = vi
      .spyOn(CartService.prototype, 'addLineWithIdempotency')
      .mockResolvedValue({ cart: cartView, replayed: false });
    const recordTamperingAttempt = vi
      .spyOn(CartService.prototype, 'recordTamperingAttempt')
      .mockResolvedValue(undefined);
    const api = await app();
    try {
      const response = await api.fastify.inject({
        method: 'POST',
        url: '/v1/cart/lines',
        headers: csrfHeaders(),
        payload: {
          variantId,
          quantity: 1,
          nested: { one: { two: { three: { four: { amountMinor: '125000' } } } } },
        },
      });
      expect(response.statusCode).toBe(422);
      expect(response.json()).toMatchObject({
        code: 'VALIDATION_FAILED',
        errors: [{ path: 'amountMinor', code: 'CART_MONEY_FIELD_FORBIDDEN' }],
      });
      expect(response.body).not.toContain('125000');
      expect(addLine).not.toHaveBeenCalled();
      expect(recordTamperingAttempt).toHaveBeenCalledWith(
        expect.objectContaining({
          actorUserId: null,
          anonymousId: anonymousCartId,
          offendingField: 'amountMinor',
        }),
      );
    } finally {
      await api.close();
    }
  });

  it('records a server-derived user ID for authenticated tampering attempts', async () => {
    const authenticate = vi
      .spyOn(IdentityService.prototype, 'authenticateSession')
      .mockResolvedValue(customer);
    const recordTamperingAttempt = vi
      .spyOn(CartService.prototype, 'recordTamperingAttempt')
      .mockResolvedValue(undefined);
    const api = await app();
    try {
      const response = await api.fastify.inject({
        method: 'POST',
        url: '/v1/cart/lines',
        headers: {
          ...csrfHeaders(),
          cookie: `honey_session=server-session; ${anonymousCookies()}`,
        },
        payload: { variantId, quantity: 1, unitPrice: '125000' },
      });

      expect(response.statusCode).toBe(422);
      expect(authenticate).toHaveBeenCalledWith('server-session');
      expect(recordTamperingAttempt).toHaveBeenCalledWith(
        expect.objectContaining({
          actorUserId: customer.userId,
          anonymousId: anonymousCartId,
          offendingField: 'unitPrice',
        }),
      );
    } finally {
      await api.close();
    }
  });

  it('keeps anonymous and user cart-line access scoped to the server-derived owner context', async () => {
    const lineId = '018f0000-0000-7000-8000-000000000072';
    const otherAnonymousCartId = '018f0000-0000-7000-8000-000000000073';
    const updateLine = vi
      .spyOn(CartService.prototype, 'updateLine')
      .mockRejectedValue(new NotFoundAppError({ code: 'CART_LINE_NOT_FOUND' }));
    const authenticate = vi.spyOn(IdentityService.prototype, 'authenticateSession');
    const api = await app();
    try {
      const anonymous = await api.fastify.inject({
        method: 'PATCH',
        url: `/v1/cart/lines/${lineId}`,
        headers: {
          cookie: `honey_cart=${otherAnonymousCartId}; csrf_token=${csrfToken}`,
          'x-csrf-token': csrfToken,
        },
        payload: { quantity: 1 },
      });
      expect(anonymous.statusCode).toBe(404);

      authenticate.mockResolvedValue(customer);
      const user = await api.fastify.inject({
        method: 'PATCH',
        url: `/v1/cart/lines/${lineId}`,
        headers: {
          cookie: `honey_session=customer; ${anonymousCookies()}`,
          'x-csrf-token': csrfToken,
        },
        payload: { quantity: 1 },
      });
      expect(user.statusCode).toBe(404);
      expect(updateLine).toHaveBeenNthCalledWith(
        1,
        {
          userId: null,
          anonymousId: otherAnonymousCartId,
          locale: 'fa',
          currency: 'IRR',
        },
        lineId,
        { quantity: 1 },
      );
      expect(updateLine).toHaveBeenNthCalledWith(
        2,
        {
          userId: customer.userId,
          anonymousId: anonymousCartId,
          locale: 'fa',
          currency: 'IRR',
        },
        lineId,
        { quantity: 1 },
      );
    } finally {
      await api.close();
    }
  });

  it('enforces the dedicated cart-write limiter separately from the global API limiter', async () => {
    vi.spyOn(CartService.prototype, 'addLineWithIdempotency').mockResolvedValue({
      cart: cartView,
      replayed: false,
    });
    const api = await app(
      config({ CART_WRITE_RATE_LIMIT_MAX: '1', CART_COUPON_RATE_LIMIT_MAX: '100' }),
    );
    try {
      const first = await api.fastify.inject({
        method: 'POST',
        url: '/v1/cart/lines',
        headers: csrfHeaders(),
        payload: { variantId, quantity: 1 },
      });
      expect(first.statusCode).toBe(200);
      expect(first.headers['ratelimit-limit']).toBe('1');

      const limited = await api.fastify.inject({
        method: 'POST',
        url: '/v1/cart/lines',
        headers: csrfHeaders(),
        payload: { variantId, quantity: 1 },
      });
      expect(limited.statusCode).toBe(429);
      expect(limited.json()).toMatchObject({ code: 'RATE_LIMITED', status: 429 });
      expect(limited.headers['cache-control']).toBe('private, no-store');
    } finally {
      await api.close();
    }
  });

  it('enforces the narrower coupon limiter independently from ordinary cart writes', async () => {
    vi.spyOn(CartService.prototype, 'applyCoupon').mockResolvedValue(cartView);
    const api = await app(
      config({ CART_WRITE_RATE_LIMIT_MAX: '100', CART_COUPON_RATE_LIMIT_MAX: '1' }),
    );
    try {
      const first = await api.fastify.inject({
        method: 'POST',
        url: '/v1/cart/coupon',
        headers: csrfHeaders(),
        payload: { code: 'WELCOME10' },
      });
      expect(first.statusCode).toBe(200);
      expect(first.headers['ratelimit-limit']).toBe('1');

      const limited = await api.fastify.inject({
        method: 'POST',
        url: '/v1/cart/coupon',
        headers: csrfHeaders(),
        payload: { code: 'WELCOME10' },
      });
      expect(limited.statusCode).toBe(429);
      expect(limited.json()).toMatchObject({ code: 'RATE_LIMITED', status: 429 });
    } finally {
      await api.close();
    }
  });
});

describe('Phase 12 pricing admin authorization', () => {
  it('requires distinct pricing read and write permissions and keeps results private', async () => {
    const authenticate = vi.spyOn(IdentityService.prototype, 'authenticateSession');
    const listTaxRates = vi
      .spyOn(PricingService.prototype, 'listTaxRates')
      .mockResolvedValue([taxRate]);
    const createTaxRate = vi
      .spyOn(PricingService.prototype, 'createTaxRate')
      .mockResolvedValue(taxRate);
    const api = await app();
    const payload = {
      code: 'IR_STANDARD',
      rateBps: 900,
      country: 'IR',
      region: null,
      isInclusive: false,
      isActive: true,
    };
    try {
      const unauthenticated = await api.fastify.inject({
        method: 'GET',
        url: '/v1/admin/pricing/tax-rates',
      });
      expect(unauthenticated.statusCode).toBe(401);

      authenticate.mockResolvedValueOnce(customer);
      const customerRead = await api.fastify.inject({
        method: 'GET',
        url: '/v1/admin/pricing/tax-rates',
        headers: { cookie: 'honey_session=customer' },
      });
      expect(customerRead.statusCode).toBe(403);

      authenticate.mockResolvedValueOnce(pricingReader);
      const readerRead = await api.fastify.inject({
        method: 'GET',
        url: '/v1/admin/pricing/tax-rates',
        headers: { cookie: 'honey_session=reader' },
      });
      expect(readerRead.statusCode).toBe(200);
      expect(readerRead.headers['cache-control']).toBe('private, no-store');
      expect(readerRead.json()).toEqual([taxRate]);
      expect(listTaxRates).toHaveBeenCalledWith(pricingReader);

      authenticate.mockResolvedValueOnce(pricingReader);
      const readerWrite = await api.fastify.inject({
        method: 'POST',
        url: '/v1/admin/pricing/tax-rates',
        headers: {
          cookie: `honey_session=reader; csrf_token=${csrfToken}`,
          'x-csrf-token': csrfToken,
        },
        payload,
      });
      expect(readerWrite.statusCode).toBe(403);

      authenticate.mockResolvedValueOnce(pricingWriter);
      const writerCreate = await api.fastify.inject({
        method: 'POST',
        url: '/v1/admin/pricing/tax-rates',
        headers: {
          cookie: `honey_session=writer; csrf_token=${csrfToken}`,
          'x-csrf-token': csrfToken,
        },
        payload,
      });
      expect(writerCreate.statusCode).toBe(201);
      expect(writerCreate.headers['cache-control']).toBe('private, no-store');
      expect(createTaxRate).toHaveBeenCalledWith(
        pricingWriter,
        payload,
        expect.objectContaining({ requestId: expect.any(String) }),
      );
    } finally {
      await api.close();
    }
  });

  it('serializes internal price minor units as wire-safe strings', async () => {
    const authenticate = vi.spyOn(IdentityService.prototype, 'authenticateSession');
    vi.spyOn(PricingService.prototype, 'listVariantPrices').mockResolvedValue([price]);
    const api = await app();
    try {
      authenticate.mockResolvedValue(pricingReader);
      const response = await api.fastify.inject({
        method: 'GET',
        url: '/v1/admin/pricing/variant-prices',
        headers: { cookie: 'honey_session=reader' },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([
        {
          id: price.id,
          variantId,
          currency: 'IRR',
          amountMinor: '125000',
          compareAtMinor: null,
          validFrom: '2026-09-01T00:00:00.000Z',
          validTo: null,
        },
      ]);
    } finally {
      await api.close();
    }
  });
});
