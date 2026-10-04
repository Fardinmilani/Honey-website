import type { FastifyInstance } from 'fastify';
import pino from 'pino';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CartService,
  ForbiddenAppError,
  IdentityService,
  NotFoundAppError,
  PaymentsService,
  type AuthenticatedPrincipal,
  type PaymentProjection,
} from '@honey/backend';
import { createApiApplication } from '../src/bootstrap/create-application.js';
import { loadApiConfig, type ApiConfig } from '../src/config/api-config.js';

const paymentId = '018f0000-0000-7000-8000-000000000501';
const csrfToken = 'b'.repeat(32);
const anonymousCartId = '018f0000-0000-7000-8000-000000000502';

const staff: AuthenticatedPrincipal = {
  userId: '018f0000-0000-7000-8000-000000000503',
  sessionId: '018f0000-0000-7000-8000-000000000504',
  kind: 'STAFF',
  permissions: ['order:refund'],
};

const customer: AuthenticatedPrincipal = {
  userId: '018f0000-0000-7000-8000-000000000505',
  sessionId: '018f0000-0000-7000-8000-000000000506',
  kind: 'CUSTOMER',
  permissions: [],
};

function paymentProjection(overrides: Partial<PaymentProjection> = {}): PaymentProjection {
  return {
    id: paymentId,
    orderNumber: 'HNY-2026-000501',
    status: 'PENDING',
    provider: 'mock',
    amount: { amountMinor: '50000', currency: 'IRR' },
    redirectUrl: 'https://fake-gateway.invalid/pay/fake_018f0000-0000-7000-8000-000000000501',
    createdAt: '2026-10-04T12:00:00.000Z',
    paidAt: null,
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

function csrfHeaders(idempotencyKey: string | undefined, token = csrfToken) {
  return {
    cookie: `honey_cart=${anonymousCartId}; csrf_token=${token}`,
    'x-csrf-token': token,
    ...(idempotencyKey === undefined ? {} : { 'idempotency-key': idempotencyKey }),
  };
}

afterEach(() => vi.restoreAllMocks());

describe('Phase 14 payment HTTP security', () => {
  it('requires an Idempotency-Key and never accepts client money or card fields', async () => {
    const start = vi
      .spyOn(PaymentsService.prototype, 'start')
      .mockResolvedValue({ payment: paymentProjection(), replayed: false });
    const recordTamperingAttempt = vi
      .spyOn(CartService.prototype, 'recordTamperingAttempt')
      .mockResolvedValue(undefined);
    const api = await app();
    try {
      const missingKey = await api.fastify.inject({
        method: 'POST',
        url: '/v1/payments',
        headers: csrfHeaders(undefined),
        payload: { orderNumber: 'HNY-2026-000501' },
      });
      expect(missingKey.statusCode).toBe(422);
      expect(start).not.toHaveBeenCalled();

      const money = await api.fastify.inject({
        method: 'POST',
        url: '/v1/payments',
        headers: csrfHeaders('payment-test-key-0001'),
        payload: {
          orderNumber: 'HNY-2026-000501',
          amountMinor: '1',
          cardNumber: '4111111111111111',
        },
      });
      expect(money.statusCode).toBe(422);
      expect(money.json()).toMatchObject({
        code: 'VALIDATION_FAILED',
        errors: [{ code: 'PAYMENT_CARD_OR_MONEY_FIELD_FORBIDDEN' }],
      });
      expect(money.body).not.toContain('4111111111111111');
      expect(start).not.toHaveBeenCalled();
      expect(recordTamperingAttempt).toHaveBeenCalled();
    } finally {
      await api.close();
    }
  });

  it('starts a payment from cookies and order number only, and marks a replay', async () => {
    const start = vi.spyOn(PaymentsService.prototype, 'start').mockResolvedValue({
      payment: paymentProjection(),
      replayed: true,
    });
    const api = await app();
    try {
      const response = await api.fastify.inject({
        method: 'POST',
        url: '/v1/payments',
        headers: csrfHeaders('payment-test-key-0002'),
        payload: { orderNumber: 'HNY-2026-000501' },
      });
      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(response.headers['idempotency-replayed']).toBe('true');
      expect(start).toHaveBeenCalledWith(
        { userId: null, anonymousId: anonymousCartId },
        'HNY-2026-000501',
        'payment-test-key-0002',
      );
      expect(response.json()).not.toHaveProperty('providerRef');
      expect(response.json()).not.toHaveProperty('cardPan');
    } finally {
      await api.close();
    }
  });

  it('verifies a return without trusting query status and hides another owner', async () => {
    const verifyReturn = vi
      .spyOn(PaymentsService.prototype, 'verifyReturn')
      .mockResolvedValue(paymentProjection({ status: 'FAILED' }));
    const get = vi
      .spyOn(PaymentsService.prototype, 'get')
      .mockRejectedValue(new NotFoundAppError());
    const api = await app();
    try {
      const verified = await api.fastify.inject({
        method: 'POST',
        url: `/v1/payments/${paymentId}/return?status=success`,
        headers: csrfHeaders(undefined),
      });
      expect(verified.statusCode).toBe(200);
      expect(verified.json()).toMatchObject({ status: 'FAILED' });
      expect(verifyReturn).toHaveBeenCalledWith(
        { userId: null, anonymousId: anonymousCartId },
        paymentId,
      );

      const hidden = await api.fastify.inject({
        method: 'GET',
        url: `/v1/payments/${paymentId}`,
        headers: { cookie: 'honey_cart=018f0000-0000-7000-8000-000000000599' },
      });
      expect(hidden.statusCode).toBe(404);
      expect(get).toHaveBeenCalled();
    } finally {
      await api.close();
    }
  });

  it('accepts a raw webhook without CSRF and rejects a non-buffer body', async () => {
    const receiveWebhook = vi.spyOn(PaymentsService.prototype, 'receiveWebhook').mockResolvedValue({
      id: '018f0000-0000-7000-8000-000000000510',
    });
    const processProviderEvent = vi
      .spyOn(PaymentsService.prototype, 'processProviderEvent')
      .mockResolvedValue();
    const api = await app();
    try {
      const accepted = await api.fastify.inject({
        method: 'POST',
        url: '/webhooks/payments/mock',
        headers: { 'content-type': 'application/json', 'x-fake-signature': 'abc' },
        payload: Buffer.from('{"eventId":"evt-1"}'),
      });
      expect(accepted.statusCode).toBe(200);
      expect(receiveWebhook).toHaveBeenCalled();
      expect(processProviderEvent).toHaveBeenCalledWith('018f0000-0000-7000-8000-000000000510');
    } finally {
      await api.close();
    }
  });

  it('requires order:refund and a recent step-up for staff refunds', async () => {
    vi.spyOn(IdentityService.prototype, 'authenticateSession').mockResolvedValue(staff);
    const refund = vi
      .spyOn(PaymentsService.prototype, 'requestRefund')
      .mockRejectedValue(new ForbiddenAppError({ code: 'STEP_UP_REQUIRED' }));
    const api = await app();
    try {
      const response = await api.fastify.inject({
        method: 'POST',
        url: `/v1/admin/payments/${paymentId}/refunds`,
        headers: {
          cookie: `honey_session=staff-session; csrf_token=${csrfToken}`,
          'x-csrf-token': csrfToken,
        },
        payload: { reason: 'customer returned the jar' },
      });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ code: 'STEP_UP_REQUIRED' });
      expect(refund).toHaveBeenCalled();
    } finally {
      await api.close();
    }
  });

  it('denies a customer refund and rejects a missing CSRF token before the service runs', async () => {
    const authentication = vi
      .spyOn(IdentityService.prototype, 'authenticateSession')
      .mockResolvedValue(customer);
    const refund = vi.spyOn(PaymentsService.prototype, 'requestRefund');
    const api = await app();
    try {
      const customerAttempt = await api.fastify.inject({
        method: 'POST',
        url: `/v1/admin/payments/${paymentId}/refunds`,
        headers: {
          cookie: `honey_session=customer-session; csrf_token=${csrfToken}`,
          'x-csrf-token': csrfToken,
        },
        payload: { reason: 'customer returned the jar' },
      });
      expect(customerAttempt.statusCode).toBe(403);
      expect(authentication).toHaveBeenCalled();
      expect(refund).not.toHaveBeenCalled();

      const missingCsrf = await api.fastify.inject({
        method: 'POST',
        url: `/v1/admin/payments/${paymentId}/refunds`,
        headers: { cookie: 'honey_session=staff-session' },
        payload: { reason: 'customer returned the jar' },
      });
      expect(missingCsrf.statusCode).toBe(403);
      expect(missingCsrf.json()).toMatchObject({ code: 'CSRF_TOKEN_INVALID' });
      expect(refund).not.toHaveBeenCalled();
    } finally {
      await api.close();
    }
  });

  it('fails closed when production would boot the mock provider or sandbox Zarinpal', () => {
    const production = {
      NODE_ENV: 'production',
      API_HOST: '0.0.0.0',
      API_PORT: '4000',
      DATABASE_URL: 'postgresql://api:api@127.0.0.1:5432/api',
      LOG_LEVEL: 'info',
      TRUST_PROXY: 'loopback',
      API_ALLOWED_ORIGINS: 'https://shop.example',
      API_BODY_LIMIT_BYTES: '1048576',
      API_SHUTDOWN_GRACE_MS: '10000',
      API_READINESS_TIMEOUT_MS: '2000',
      API_RATE_LIMIT_MAX: '300',
      API_RATE_LIMIT_WINDOW_MS: '60000',
      CSRF_COOKIE_NAME: '__Host-csrf',
      CSRF_HEADER_NAME: 'x-csrf-token',
      CSRF_COOKIE_SECURE: 'true',
      REDIS_URL: 'redis://127.0.0.1:6379',
      SESSION_COOKIE_NAME: '__Host-session',
      SESSION_COOKIE_SECURE: 'true',
      PASSWORD_ARGON2_MEMORY_KIB: '65536',
      PASSWORD_ARGON2_TIME_COST: '3',
      PASSWORD_ARGON2_PARALLELISM: '1',
      PASSWORD_MIN_LENGTH: '10',
      PASSWORD_MAX_LENGTH: '128',
      CUSTOMER_SESSION_IDLE_SECONDS: '2592000',
      CUSTOMER_SESSION_ABSOLUTE_SECONDS: '2592000',
      STAFF_SESSION_IDLE_SECONDS: '28800',
      STAFF_SESSION_ABSOLUTE_SECONDS: '43200',
      SESSION_TOUCH_INTERVAL_SECONDS: '300',
      EMAIL_VERIFICATION_TTL_SECONDS: '86400',
      PASSWORD_RESET_TTL_SECONDS: '1800',
      PREAUTH_CHALLENGE_TTL_SECONDS: '300',
      TOTP_ISSUER: 'Honey',
      TOTP_ENCRYPTION_KEY_BASE64: 'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=',
      TOTP_DRIFT_SECONDS: '30',
      AUTH_LOCKOUT_WINDOW_SECONDS: '900',
      AUTH_LOCKOUT_MAX_FAILURES: '10',
      AUTH_LOCKOUT_BASE_SECONDS: '30',
      AUTH_LOCKOUT_MAX_SECONDS: '900',
      PWNED_PASSWORDS_ENDPOINT: 'https://api.pwnedpasswords.com/range/',
      PWNED_PASSWORDS_TIMEOUT_MS: '3000',
      IDENTITY_SMTP_HOST: 'localhost',
      IDENTITY_SMTP_PORT: '1025',
      IDENTITY_SMTP_SECURE: 'false',
      IDENTITY_EMAIL_FROM: 'no-reply@example.invalid',
      IDENTITY_SMTP_TIMEOUT_MS: '5000',
      S3_INTERNAL_ENDPOINT: 'https://s3.internal.example',
      S3_BROWSER_ENDPOINT: 'https://storage.example',
      S3_REGION: 'eu-central-1',
      S3_ACCESS_KEY: 'production-access-key-placeholder',
      S3_SECRET_KEY: 'production-secret-key-placeholder',
      S3_FORCE_PATH_STYLE: 'true',
      S3_PUBLIC_BUCKET: 'honey-media-production',
      S3_PRIVATE_BUCKET: 'honey-private-production',
      S3_REQUEST_TIMEOUT_MS: '5000',
      PUBLIC_MEDIA_BASE_URL: 'https://media.example/',
      MEDIA_UPLOAD_ALLOWED_ORIGINS: 'https://shop.example',
      MEDIA_MAX_IMAGE_BYTES: '15728640',
      MEDIA_MAX_VIDEO_BYTES: '104857600',
      MEDIA_MAX_DECODED_PIXELS: '40000000',
      MEDIA_MAX_WIDTH: '12000',
      MEDIA_MAX_HEIGHT: '12000',
      MEDIA_PRESIGNED_UPLOAD_TTL_SECONDS: '300',
      MEDIA_PRIVATE_DOWNLOAD_TTL_SECONDS: '120',
      MEDIA_UPLOAD_INTENT_TTL_SECONDS: '600',
      MEDIA_PROCESSING_TIMEOUT_MS: '30000',
      MEDIA_DERIVATIVE_PROFILE: 'honey-v1',
      CATALOG_ENABLED_LOCALES: 'fa,en',
      CATALOG_DEFAULT_LOCALE: 'fa',
      CATALOG_CACHE_TTL_SECONDS: '60',
      CATALOG_CACHE_NAMESPACE: 'honey:catalog:v1',
      CATALOG_SEARCH_QUERY_MAX_LENGTH: '160',
      CATALOG_MAX_CATEGORY_DEPTH: '6',
      CART_COOKIE_NAME: '__Host-cart',
      CART_COOKIE_SECURE: 'true',
      CART_ACTIVE_TTL_SECONDS: '2592000',
      CART_LINE_MAX_QUANTITY: '1000',
      CART_DEFAULT_CURRENCY: 'IRR',
      CART_ENABLED_CURRENCIES: 'IRR',
      CART_WRITE_RATE_LIMIT_MAX: '120',
      CART_COUPON_RATE_LIMIT_MAX: '20',
      STEP_UP_TTL_SECONDS: '300',
      PAYMENT_PROVIDER: 'mock',
      PAYMENT_CALLBACK_URL: 'https://shop.example/fa/checkout/payment-return',
      PAYMENT_PROVIDER_REQUEST_TIMEOUT_MS: '8000',
      PAYMENT_RECONCILIATION_MIN_AGE_SECONDS: '300',
      ZARINPAL_MERCHANT_ID: '22222222-2222-2222-2222-222222222222',
      ZARINPAL_MODE: 'production',
    };
    expect(() => loadApiConfig(production)).toThrow('mock payment provider');
    expect(() =>
      loadApiConfig({
        ...production,
        PAYMENT_PROVIDER: 'zarinpal',
        PAYMENT_CALLBACK_URL: 'http://shop.example/fa/checkout/payment-return',
      }),
    ).toThrow('HTTPS');
    expect(() =>
      loadApiConfig({
        ...production,
        PAYMENT_PROVIDER: 'zarinpal',
        ZARINPAL_MODE: 'sandbox',
      }),
    ).toThrow('unsafe');
  });
});
