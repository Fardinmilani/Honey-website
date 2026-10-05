import type { FastifyInstance } from 'fastify';
import pino from 'pino';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CartService,
  CheckoutService,
  FulfilmentService,
  IdentityService,
  NotFoundAppError,
  OrdersService,
  ShippingSettingsService,
  type AuthenticatedPrincipal,
  type CheckoutProjection,
  type CustomerOrder,
  type ShipmentRecord,
} from '@honey/backend';
import { createApiApplication } from '../src/bootstrap/create-application.js';
import { loadApiConfig, type ApiConfig } from '../src/config/api-config.js';

const checkoutId = '018f0000-0000-7000-8000-000000000701';
const quoteId = '018f0000-0000-7000-8000-000000000702';
const orderId = '018f0000-0000-7000-8000-000000000703';
const orderLineId = '018f0000-0000-7000-8000-000000000704';
const shipmentId = '018f0000-0000-7000-8000-000000000705';
const anonymousId = '018f0000-0000-7000-8000-000000000706';
const csrf = 'c'.repeat(32);

const staff: AuthenticatedPrincipal = {
  userId: '018f0000-0000-7000-8000-000000000707',
  sessionId: '018f0000-0000-7000-8000-000000000708',
  kind: 'STAFF',
  permissions: ['order:read', 'order:write', 'order:cancel', 'settings:read', 'settings:write'],
};

const customer: AuthenticatedPrincipal = {
  userId: '018f0000-0000-7000-8000-000000000709',
  sessionId: '018f0000-0000-7000-8000-000000000710',
  kind: 'CUSTOMER',
  permissions: [],
};

function config(): ApiConfig {
  return loadApiConfig({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://api:api@127.0.0.1:5432/api',
    REDIS_URL: 'redis://127.0.0.1:6379',
    API_RATE_LIMIT_MAX: '100',
  });
}

async function app(): Promise<Readonly<{ close: () => Promise<void>; fastify: FastifyInstance }>> {
  const application = await createApiApplication({
    config: config(),
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

function guestHeaders() {
  return {
    cookie: `honey_cart=${anonymousId}; csrf_token=${csrf}`,
    'x-csrf-token': csrf,
  };
}

function staffHeaders() {
  return {
    cookie: `honey_session=staff-session; csrf_token=${csrf}`,
    'x-csrf-token': csrf,
  };
}

function quote() {
  return {
    id: quoteId,
    methodCode: 'STANDARD',
    name: 'Standard delivery',
    amount: { amountMinor: '500', currency: 'IRR' },
    discount: { amountMinor: '0', currency: 'IRR' },
    total: { amountMinor: '500', currency: 'IRR' },
    expiresAt: '2026-10-05T20:00:00.000Z',
  };
}

function checkoutProjection(): CheckoutProjection {
  return {
    id: checkoutId,
    status: 'OPEN',
    email: 'customer@example.invalid',
    phone: null,
    shippingAddress: null,
    billingAddress: null,
    sameAsShipping: true,
    shippingQuote: quote(),
    shippingQuotes: [quote()],
    reservationExpiresAt: '2026-10-05T20:00:00.000Z',
    pricing: null,
  };
}

function shipment(): ShipmentRecord {
  return {
    id: shipmentId,
    orderId,
    provider: 'manual-flat',
    status: 'PENDING',
    trackingNumber: 'TRACK-123',
    trackingUrl: null,
    shippedAt: null,
    deliveredAt: null,
    lines: [{ orderLineId, quantity: 1 }],
  };
}

function customerOrder(): CustomerOrder {
  return {
    number: 'HNY-2026-000701',
    email: 'customer@example.invalid',
    phone: null,
    localeAtPurchase: 'en',
    currency: 'IRR',
    status: 'PARTIALLY_FULFILLED',
    paymentStatus: 'PAID',
    fulfilmentStatus: 'PARTIAL',
    subtotalMinor: 1_000n,
    discountTotalMinor: 0n,
    shippingTotalMinor: 500n,
    taxTotalMinor: 0n,
    grandTotalMinor: 1_500n,
    couponCodeSnapshot: null,
    shippingMethodSnapshot: { code: 'STANDARD' },
    shippingAddressSnapshot: { country: 'IR' },
    billingAddressSnapshot: { country: 'IR' },
    placedAt: new Date('2026-10-05T12:00:00.000Z'),
    lines: [
      {
        productNameSnapshot: { en: 'Honey' },
        variantNameSnapshot: { en: 'Jar' },
        skuSnapshot: 'HNY-1',
        imageUrlSnapshot: null,
        quantity: 2,
        unitPriceMinor: 500n,
        discountAllocatedMinor: 0n,
        taxRateBps: 0,
        taxAmountMinor: 0n,
        lineTotalMinor: 1_000n,
      },
    ],
    shipments: [
      {
        id: shipmentId,
        status: 'IN_TRANSIT',
        provider: 'manual-flat',
        trackingNumber: 'TRACK-123',
        trackingUrl: null,
        shippedAt: new Date('2026-10-05T13:00:00.000Z'),
        deliveredAt: null,
        lines: [{ quantity: 1 }],
      },
    ],
  };
}

afterEach(() => vi.restoreAllMocks());

describe('Phase 15 HTTP shipping and fulfilment security', () => {
  it('selects an owned quote identifier and rejects client shipping money', async () => {
    const tampering = vi
      .spyOn(CartService.prototype, 'recordTamperingAttempt')
      .mockResolvedValue(undefined);
    const select = vi
      .spyOn(CheckoutService.prototype, 'selectShippingQuote')
      .mockResolvedValue(checkoutProjection());
    const api = await app();
    try {
      const tampered = await api.fastify.inject({
        method: 'POST',
        url: `/v1/checkout/${checkoutId}/shipping-selection`,
        headers: guestHeaders(),
        payload: { quoteId, amountMinor: '1' },
      });
      expect(tampered.statusCode).toBe(422);
      expect(tampering).toHaveBeenCalled();
      expect(select).not.toHaveBeenCalled();

      const valid = await api.fastify.inject({
        method: 'POST',
        url: `/v1/checkout/${checkoutId}/shipping-selection`,
        headers: guestHeaders(),
        payload: { quoteId },
      });
      expect(valid.statusCode).toBe(200);
      expect(valid.headers['cache-control']).toBe('private, no-store');
      expect(select).toHaveBeenCalledWith(
        expect.objectContaining({ userId: null, anonymousId }),
        checkoutId,
        quoteId,
      );
      expect(valid.json()).toMatchObject({
        shippingQuote: { id: quoteId, methodCode: 'STANDARD' },
      });
    } finally {
      await api.close();
    }
  });

  it('requires CSRF and staff order:write before creating a shipment', async () => {
    const authenticate = vi
      .spyOn(IdentityService.prototype, 'authenticateSession')
      .mockResolvedValue(customer);
    const create = vi
      .spyOn(FulfilmentService.prototype, 'createShipment')
      .mockResolvedValue(shipment());
    const api = await app();
    const payload = { lines: [{ orderLineId, quantity: 1 }], trackingNumber: 'TRACK-123' };
    try {
      const missingCsrf = await api.fastify.inject({
        method: 'POST',
        url: `/v1/admin/fulfilment/orders/${orderId}/shipments`,
        headers: { cookie: 'honey_session=staff-session', 'idempotency-key': 'shipment-key-0001' },
        payload,
      });
      expect(missingCsrf.statusCode).toBe(403);
      expect(create).not.toHaveBeenCalled();

      const denied = await api.fastify.inject({
        method: 'POST',
        url: `/v1/admin/fulfilment/orders/${orderId}/shipments`,
        headers: { ...staffHeaders(), 'idempotency-key': 'shipment-key-0001' },
        payload,
      });
      expect(denied.statusCode).toBe(403);
      expect(create).not.toHaveBeenCalled();

      authenticate.mockResolvedValue(staff);
      const accepted = await api.fastify.inject({
        method: 'POST',
        url: `/v1/admin/fulfilment/orders/${orderId}/shipments`,
        headers: { ...staffHeaders(), 'idempotency-key': 'shipment-key-0001' },
        payload,
      });
      expect(accepted.statusCode).toBe(200);
      expect(accepted.headers['cache-control']).toBe('private, no-store');
      expect(create).toHaveBeenCalledWith(
        staff,
        expect.objectContaining({ orderId, idempotencyKey: 'shipment-key-0001' }),
        expect.objectContaining({ requestId: expect.any(String) }),
      );
    } finally {
      await api.close();
    }
  });

  it('rejects body money on dispatch and only exposes safe shipment fields to the owner', async () => {
    vi.spyOn(IdentityService.prototype, 'authenticateSession').mockResolvedValue(staff);
    const dispatch = vi.spyOn(FulfilmentService.prototype, 'markShipped').mockResolvedValue({
      ...shipment(),
      status: 'IN_TRANSIT',
      shippedAt: new Date('2026-10-05T13:00:00.000Z'),
    });
    const order = vi
      .spyOn(OrdersService.prototype, 'getOwnedOrder')
      .mockImplementation(async (_number, owner) => {
        if ('anonymousId' in owner && owner.anonymousId !== anonymousId) {
          throw new NotFoundAppError();
        }
        return customerOrder();
      });
    const api = await app();
    try {
      const tampered = await api.fastify.inject({
        method: 'POST',
        url: `/v1/admin/fulfilment/shipments/${shipmentId}/dispatch`,
        headers: staffHeaders(),
        payload: { shippingTotalMinor: '1' },
      });
      expect(tampered.statusCode).toBe(422);
      expect(dispatch).not.toHaveBeenCalled();

      const visible = await api.fastify.inject({
        method: 'GET',
        url: '/v1/orders/HNY-2026-000701',
        headers: { cookie: `honey_cart=${anonymousId}` },
      });
      expect(visible.statusCode).toBe(200);
      expect(order).toHaveBeenCalled();
      expect(visible.json()).toMatchObject({
        fulfilmentStatus: 'PARTIAL',
        shipments: [{ status: 'IN_TRANSIT', trackingNumber: 'TRACK-123' }],
      });
      expect(visible.body).not.toContain('stockLocationId');
      expect(visible.body).not.toContain('stockReservationId');
      expect(visible.body).not.toContain('orderLineId');
      expect(visible.body).not.toContain('providerPayload');

      const otherOwner = await api.fastify.inject({
        method: 'GET',
        url: '/v1/orders/HNY-2026-000701',
        headers: { cookie: 'honey_cart=018f0000-0000-7000-8000-000000000799' },
      });
      expect(otherOwner.statusCode).toBe(404);
    } finally {
      await api.close();
    }
  });

  it('requires settings:write and rejects a client shipping amount field in configuration', async () => {
    const authenticate = vi
      .spyOn(IdentityService.prototype, 'authenticateSession')
      .mockResolvedValue(customer);
    const write = vi
      .spyOn(ShippingSettingsService.prototype, 'upsertZone')
      .mockResolvedValue({ id: orderId });
    const api = await app();
    const payload = { name: 'Iran', countries: ['IR'], provinces: [], priority: 0 };
    try {
      const denied = await api.fastify.inject({
        method: 'PUT',
        url: `/v1/admin/shipping/zones/${orderId}`,
        headers: staffHeaders(),
        payload,
      });
      expect(denied.statusCode).toBe(403);
      authenticate.mockResolvedValue(staff);

      const tampered = await api.fastify.inject({
        method: 'PUT',
        url: `/v1/admin/shipping/zones/${orderId}`,
        headers: staffHeaders(),
        payload: { ...payload, shippingTotalMinor: '1' },
      });
      expect(tampered.statusCode).toBe(422);
      expect(write).not.toHaveBeenCalled();

      const accepted = await api.fastify.inject({
        method: 'PUT',
        url: `/v1/admin/shipping/zones/${orderId}`,
        headers: staffHeaders(),
        payload,
      });
      expect(accepted.statusCode).toBe(200);
      expect(write).toHaveBeenCalledWith(
        expect.objectContaining({ id: orderId, countries: ['IR'] }),
        expect.objectContaining({ actorUserId: staff.userId }),
      );
    } finally {
      await api.close();
    }
  });
});
