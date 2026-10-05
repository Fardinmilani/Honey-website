import type { FastifyInstance } from 'fastify';
import pino from 'pino';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CartService,
  CheckoutService,
  IdentityService,
  NotFoundAppError,
  OrdersService,
  ConflictAppError,
  type AuthenticatedPrincipal,
  type CheckoutProjection,
  type CustomerOrder,
} from '@honey/backend';
import { createApiApplication } from '../src/bootstrap/create-application.js';
import { loadApiConfig, type ApiConfig } from '../src/config/api-config.js';

const checkoutId = '018f0000-0000-7000-8000-000000000201';
const anonymousCartId = '018f0000-0000-7000-8000-000000000202';
const csrfToken = 'a'.repeat(32);

const customer: AuthenticatedPrincipal = {
  userId: '018f0000-0000-7000-8000-000000000203',
  sessionId: '018f0000-0000-7000-8000-000000000204',
  kind: 'CUSTOMER',
  permissions: [],
};

function checkoutProjection(overrides: Partial<CheckoutProjection> = {}): CheckoutProjection {
  return {
    id: checkoutId,
    status: 'OPEN',
    email: 'phase13@example.invalid',
    phone: null,
    shippingAddress: null,
    billingAddress: null,
    sameAsShipping: true,
    shippingQuote: null,
    shippingQuotes: [],
    reservationExpiresAt: '2026-09-25T12:15:00.000Z',
    pricing: null,
    ...overrides,
  };
}

function startPayload(): Record<string, unknown> {
  return {
    email: 'phase13@example.invalid',
    shippingAddress: {
      fullName: 'Phase Thirteen',
      phone: '+989120000000',
      country: 'US',
      province: 'Isfahan',
      city: 'Isfahan',
      postalCode: '81647',
      line1: '1 Saffron Alley',
    },
    sameAsShipping: true,
  };
}

function customerOrder(overrides: Partial<CustomerOrder> = {}): CustomerOrder {
  return {
    number: 'HNY-2026-000301',
    email: 'phase13@example.invalid',
    phone: null,
    localeAtPurchase: 'en',
    currency: 'IRR',
    status: 'PENDING_PAYMENT',
    paymentStatus: 'UNPAID',
    fulfilmentStatus: 'UNFULFILLED',
    subtotalMinor: 1_000n,
    discountTotalMinor: 0n,
    shippingTotalMinor: 500n,
    taxTotalMinor: 90n,
    grandTotalMinor: 1_590n,
    couponCodeSnapshot: null,
    shippingMethodSnapshot: { code: 'STANDARD' },
    shippingAddressSnapshot: { country: 'US' },
    billingAddressSnapshot: { country: 'US' },
    placedAt: new Date('2026-09-25T12:00:00.000Z'),
    shipments: [],
    lines: [
      {
        productNameSnapshot: { en: 'Phase thirteen honey' },
        variantNameSnapshot: { en: '450 g jar' },
        skuSnapshot: 'PHASE13-V',
        imageUrlSnapshot: null,
        quantity: 1,
        unitPriceMinor: 1_000n,
        discountAllocatedMinor: 0n,
        taxRateBps: 900,
        taxAmountMinor: 90n,
        lineTotalMinor: 1_090n,
      },
    ],
    ...overrides,
  };
}

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

function csrfHeaders(idempotencyKey: string | undefined, token = csrfToken) {
  return {
    cookie: anonymousCookies(token),
    'x-csrf-token': token,
    ...(idempotencyKey === undefined ? {} : { 'idempotency-key': idempotencyKey }),
  };
}

afterEach(() => vi.restoreAllMocks());

describe('Phase 13 checkout HTTP security', () => {
  it('requires an Idempotency-Key before starting a checkout and derives ownership from cookies, never the body', async () => {
    const start = vi
      .spyOn(CheckoutService.prototype, 'start')
      .mockResolvedValue({ checkout: checkoutProjection(), replayed: false });
    const api = await app();
    try {
      const missingKey = await api.fastify.inject({
        method: 'POST',
        url: '/v1/checkout',
        headers: csrfHeaders(undefined),
        payload: startPayload(),
      });
      expect(missingKey.statusCode).toBe(422);
      expect(missingKey.json()).toMatchObject({
        code: 'VALIDATION_FAILED',
        errors: [{ path: 'idempotencyKey', code: 'IDEMPOTENCY_KEY_REQUIRED' }],
      });
      expect(start).not.toHaveBeenCalled();

      const response = await api.fastify.inject({
        method: 'POST',
        url: '/v1/checkout',
        headers: csrfHeaders('checkout-test-key-0001'),
        payload: startPayload(),
      });
      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(start).toHaveBeenCalledWith(
        expect.objectContaining({ userId: null, anonymousId: anonymousCartId }),
        expect.objectContaining({ email: 'phase13@example.invalid' }),
        'checkout-test-key-0001',
      );
    } finally {
      await api.close();
    }
  });

  it('rejects missing and mismatched CSRF tokens before a checkout start write', async () => {
    const start = vi.spyOn(CheckoutService.prototype, 'start');
    const api = await app();
    try {
      const missing = await api.fastify.inject({
        method: 'POST',
        url: '/v1/checkout',
        headers: { cookie: `honey_cart=${anonymousCartId}`, 'idempotency-key': 'k' },
        payload: startPayload(),
      });
      expect(missing.statusCode).toBe(403);
      expect(missing.json()).toMatchObject({ code: 'CSRF_TOKEN_INVALID', status: 403 });

      const mismatched = await api.fastify.inject({
        method: 'POST',
        url: '/v1/checkout',
        headers: {
          cookie: anonymousCookies(),
          'x-csrf-token': 'b'.repeat(32),
          'idempotency-key': 'k',
        },
        payload: startPayload(),
      });
      expect(mismatched.statusCode).toBe(403);
      expect(start).not.toHaveBeenCalled();
    } finally {
      await api.close();
    }
  });

  it('rejects a money-shaped field on checkout start as tampering, recording it without ever forwarding it', async () => {
    const start = vi
      .spyOn(CheckoutService.prototype, 'start')
      .mockResolvedValue({ checkout: checkoutProjection(), replayed: false });
    const recordTamperingAttempt = vi
      .spyOn(CartService.prototype, 'recordTamperingAttempt')
      .mockResolvedValue(undefined);
    const api = await app();
    try {
      const response = await api.fastify.inject({
        method: 'POST',
        url: '/v1/checkout',
        headers: csrfHeaders('checkout-test-key-0002'),
        payload: { ...startPayload(), grandTotalMinor: '1' },
      });
      expect(response.statusCode).toBe(422);
      expect(response.json()).toMatchObject({
        code: 'VALIDATION_FAILED',
        errors: [{ path: 'grandTotalMinor', code: 'CHECKOUT_MONEY_FIELD_FORBIDDEN' }],
      });
      expect(response.body).not.toContain('"1"');
      expect(start).not.toHaveBeenCalled();
      expect(recordTamperingAttempt).toHaveBeenCalledWith(
        expect.objectContaining({
          actorUserId: null,
          anonymousId: anonymousCartId,
          offendingField: 'grandTotalMinor',
        }),
      );
    } finally {
      await api.close();
    }
  });

  it('rejects a client-supplied field outside the checkout contract (e.g. an attempted userId override) with 422 instead of forwarding it', async () => {
    const start = vi
      .spyOn(CheckoutService.prototype, 'start')
      .mockResolvedValue({ checkout: checkoutProjection(), replayed: false });
    const api = await app();
    try {
      const response = await api.fastify.inject({
        method: 'POST',
        url: '/v1/checkout',
        headers: csrfHeaders('checkout-test-key-0003'),
        payload: { ...startPayload(), userId: customer.userId },
      });
      expect(response.statusCode).toBe(422);
      expect(response.json()).toMatchObject({ code: 'VALIDATION_FAILED' });
      expect(start).not.toHaveBeenCalled();
    } finally {
      await api.close();
    }
  });

  it('reads a checkout scoped to the server-derived owner and rejects another owner with 404', async () => {
    const get = vi.spyOn(CheckoutService.prototype, 'get').mockImplementation(async (context) => {
      if (context.anonymousId !== anonymousCartId) throw new NotFoundAppError();
      return checkoutProjection();
    });
    const api = await app();
    try {
      const owned = await api.fastify.inject({
        method: 'GET',
        url: `/v1/checkout/${checkoutId}`,
        headers: { cookie: anonymousCookies() },
      });
      expect(owned.statusCode).toBe(200);
      expect(owned.headers['cache-control']).toBe('private, no-store');

      const otherOwner = await api.fastify.inject({
        method: 'GET',
        url: `/v1/checkout/${checkoutId}`,
        headers: { cookie: `honey_cart=018f0000-0000-7000-8000-000000000299` },
      });
      expect(otherOwner.statusCode).toBe(404);
      expect(get).toHaveBeenCalledTimes(2);
    } finally {
      await api.close();
    }
  });

  it('requires CSRF before extending a reservation hold; the client sends no body and cannot set the new expiry', async () => {
    const extend = vi
      .spyOn(CheckoutService.prototype, 'extend')
      .mockResolvedValue(checkoutProjection({ reservationExpiresAt: '2026-09-25T12:30:00.000Z' }));
    const api = await app();
    try {
      const missingCsrf = await api.fastify.inject({
        method: 'POST',
        url: `/v1/checkout/${checkoutId}/extend`,
        headers: { cookie: `honey_cart=${anonymousCartId}` },
      });
      expect(missingCsrf.statusCode).toBe(403);
      expect(extend).not.toHaveBeenCalled();

      const response = await api.fastify.inject({
        method: 'POST',
        url: `/v1/checkout/${checkoutId}/extend`,
        headers: csrfHeaders(undefined),
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ reservationExpiresAt: '2026-09-25T12:30:00.000Z' });
      expect(extend).toHaveBeenCalledWith(
        expect.objectContaining({ anonymousId: anonymousCartId }),
        checkoutId,
      );
    } finally {
      await api.close();
    }
  });

  it('surfaces an already-elapsed reservation as a 409 conflict rather than silently reviving it', async () => {
    vi.spyOn(CheckoutService.prototype, 'extend').mockRejectedValue(
      new ConflictAppError({ code: 'RESERVATION_EXPIRED' }),
    );
    const api = await app();
    try {
      const response = await api.fastify.inject({
        method: 'POST',
        url: `/v1/checkout/${checkoutId}/extend`,
        headers: csrfHeaders(undefined),
      });
      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'RESERVATION_EXPIRED' });
    } finally {
      await api.close();
    }
  });

  it('requires an Idempotency-Key before confirming and reports PRICE_CHANGED as a conflict without a fake order number', async () => {
    const confirm = vi
      .spyOn(CheckoutService.prototype, 'confirm')
      .mockResolvedValue({ state: 'PRICE_CHANGED', checkout: checkoutProjection() });
    const api = await app();
    try {
      const missingKey = await api.fastify.inject({
        method: 'POST',
        url: `/v1/checkout/${checkoutId}/confirm`,
        headers: csrfHeaders(undefined),
      });
      expect(missingKey.statusCode).toBe(422);
      expect(missingKey.json()).toMatchObject({
        code: 'VALIDATION_FAILED',
        errors: [{ path: 'idempotencyKey', code: 'IDEMPOTENCY_KEY_REQUIRED' }],
      });
      expect(confirm).not.toHaveBeenCalled();

      const priceChanged = await api.fastify.inject({
        method: 'POST',
        url: `/v1/checkout/${checkoutId}/confirm`,
        headers: csrfHeaders('confirm-test-key-0001'),
      });
      expect(priceChanged.statusCode).toBe(409);
      expect(priceChanged.json()).toMatchObject({ code: 'PRICE_CHANGED' });
      expect(priceChanged.body).not.toContain('"orderNumber"');
    } finally {
      await api.close();
    }
  });

  it('confirms once, exposes only an UNPAID order reference, and marks a replay explicitly instead of duplicating', async () => {
    const confirm = vi.spyOn(CheckoutService.prototype, 'confirm').mockResolvedValueOnce({
      state: 'CONFIRMED',
      checkout: checkoutProjection({ status: 'AWAITING_PAYMENT' }),
      orderNumber: 'HNY-2026-000301',
      replayed: false,
    });
    const api = await app();
    try {
      const response = await api.fastify.inject({
        method: 'POST',
        url: `/v1/checkout/${checkoutId}/confirm`,
        headers: csrfHeaders('confirm-test-key-0002'),
      });
      expect(response.statusCode).toBe(200);
      expect(response.headers['idempotency-replayed']).toBeUndefined();
      expect(response.json()).toMatchObject({ orderNumber: 'HNY-2026-000301' });
      expect(response.body.toLowerCase()).not.toContain('paid');
      expect(response.body.toLowerCase()).not.toContain('"status":"paid"');

      confirm.mockResolvedValueOnce({
        state: 'CONFIRMED',
        checkout: checkoutProjection({ status: 'AWAITING_PAYMENT' }),
        orderNumber: 'HNY-2026-000301',
        replayed: true,
      });
      const replay = await api.fastify.inject({
        method: 'POST',
        url: `/v1/checkout/${checkoutId}/confirm`,
        headers: csrfHeaders('confirm-test-key-0002'),
      });
      expect(replay.statusCode).toBe(200);
      expect(replay.headers['idempotency-replayed']).toBe('true');
      expect(replay.json()).toMatchObject({ orderNumber: 'HNY-2026-000301' });
    } finally {
      await api.close();
    }
  });
});

describe('Phase 13 orders HTTP security', () => {
  it('never lists orders for a guest and only ever lists the authenticated owner’s own orders', async () => {
    const authenticate = vi.spyOn(IdentityService.prototype, 'authenticateSession');
    const listForUser = vi
      .spyOn(OrdersService.prototype, 'listForUser')
      .mockResolvedValue([customerOrder()]);
    const api = await app();
    try {
      const guest = await api.fastify.inject({ method: 'GET', url: '/v1/orders' });
      expect(guest.statusCode).toBe(404);
      expect(listForUser).not.toHaveBeenCalled();

      authenticate.mockResolvedValue(customer);
      const authenticated = await api.fastify.inject({
        method: 'GET',
        url: '/v1/orders',
        headers: { cookie: 'honey_session=customer' },
      });
      expect(authenticated.statusCode).toBe(200);
      expect(authenticated.headers['cache-control']).toBe('private, no-store');
      expect(listForUser).toHaveBeenCalledWith(customer.userId);
    } finally {
      await api.close();
    }
  });

  it('reads one order scoped to the server-derived owner, denies another owner, and never leaks internal fields', async () => {
    const getOwnedOrder = vi
      .spyOn(OrdersService.prototype, 'getOwnedOrder')
      .mockImplementation(async (number, owner) => {
        if ('anonymousId' in owner && owner.anonymousId !== anonymousCartId)
          throw new NotFoundAppError();
        return customerOrder({ number });
      });
    const api = await app();
    try {
      const owned = await api.fastify.inject({
        method: 'GET',
        url: '/v1/orders/HNY-2026-000301',
        headers: { cookie: anonymousCookies() },
      });
      expect(owned.statusCode).toBe(200);
      expect(owned.headers['cache-control']).toBe('private, no-store');
      const body = owned.json() as Record<string, unknown>;
      expect(Object.keys(body).sort()).toEqual(
        [
          'currency',
          'discountTotal',
          'fulfilmentStatus',
          'grandTotal',
          'lines',
          'number',
          'paymentStatus',
          'placedAt',
          'shipments',
          'shippingAddress',
          'shippingTotal',
          'status',
          'subtotal',
          'taxTotal',
        ].sort(),
      );
      expect(JSON.stringify(body)).not.toMatch(
        /stockLocationId|checkoutSessionId|supplier|onHand|availableToSell/iu,
      );

      const otherOwner = await api.fastify.inject({
        method: 'GET',
        url: '/v1/orders/HNY-2026-000301',
        headers: { cookie: `honey_cart=018f0000-0000-7000-8000-000000000298` },
      });
      expect(otherOwner.statusCode).toBe(404);
      expect(getOwnedOrder).toHaveBeenCalledTimes(2);
    } finally {
      await api.close();
    }
  });
});
