import { describe, expect, it } from 'vitest';

import {
  ZarinpalPaymentProvider,
  type ZarinpalFetch,
} from '../src/modules/payments/infrastructure/providers/zarinpal/zarinpal-payment-provider.js';

const merchantId = '11111111-1111-1111-1111-111111111111';
const authority = 'A00000000000000000000000000000000000';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function provider(
  fetchImpl: ZarinpalFetch,
  options: Readonly<{ accessToken?: string | null; mode?: 'sandbox' | 'production' }> = {},
): ZarinpalPaymentProvider {
  return new ZarinpalPaymentProvider(
    {
      merchantId,
      mode: options.mode ?? 'sandbox',
      accessToken: options.accessToken === undefined ? null : options.accessToken,
      requestTimeoutMs: 50,
    },
    fetchImpl,
  );
}

describe('ZarinpalPaymentProvider official REST v4 contract', () => {
  it('declares honest capabilities from the official REST surface', () => {
    const withoutRefund = provider(async () => jsonResponse({}));
    expect(withoutRefund.capabilities).toEqual({
      redirect: true,
      capture: false,
      refund: false,
      partialRefund: false,
      webhooks: false,
      verifyReturn: true,
    });
    const withRefund = provider(async () => jsonResponse({}), { accessToken: 'token' });
    expect(withRefund.capabilities.refund).toBe(true);
    expect(withRefund.capabilities.partialRefund).toBe(false);
    expect(withRefund.capabilities.webhooks).toBe(false);
    expect('parseWebhook' in withRefund).toBe(false);
    expect('capture' in withRefund).toBe(false);
  });

  it('serializes request.json with integer rials, callback, and metadata.order_id', async () => {
    let captured: Readonly<{ url: string; body: Record<string, unknown> }> | undefined;
    const adapter = provider(async (url, init) => {
      captured = { url, body: JSON.parse(init.body) as Record<string, unknown> };
      return jsonResponse({ data: { code: 100, message: 'Success', authority } });
    });
    const created = await adapter.createPayment({
      paymentId: '018f0000-0000-7000-8000-000000000014',
      orderNumber: 'HNY-2026-000414',
      amountMinor: 50_000n,
      currency: 'IRR',
      description: 'Order HNY-2026-000414',
      callbackUrl:
        'https://shop.example/en/checkout/payment-return?paymentId=018f0000-0000-7000-8000-000000000014',
      customerEmail: 'pay@example.invalid',
      customerMobile: '+989120000000',
    });
    expect(captured?.url).toBe('https://sandbox.zarinpal.com/pg/v4/payment/request.json');
    expect(captured?.body).toEqual({
      merchant_id: merchantId,
      amount: 50_000,
      currency: 'IRR',
      callback_url:
        'https://shop.example/en/checkout/payment-return?paymentId=018f0000-0000-7000-8000-000000000014',
      description: 'Order HNY-2026-000414',
      metadata: {
        email: 'pay@example.invalid',
        mobile: '+989120000000',
        order_id: 'HNY-2026-000414',
      },
    });
    expect(created.providerRef).toBe(authority);
    expect(created.redirectUrl).toBe(`https://sandbox.zarinpal.com/pg/StartPay/${authority}`);
    expect(created.raw).toEqual({ code: 100, message: 'Success' });
  });

  it('rejects a provider create that is not code 100', async () => {
    const adapter = provider(async () =>
      jsonResponse({ data: { code: -9, message: 'Validation error' } }),
    );
    await expect(
      adapter.createPayment({
        paymentId: '018f0000-0000-7000-8000-000000000015',
        orderNumber: 'HNY-2026-000415',
        amountMinor: 50_000n,
        currency: 'IRR',
        description: 'Order HNY-2026-000415',
        callbackUrl: 'https://shop.example/en/checkout/payment-return',
        customerEmail: null,
        customerMobile: null,
      }),
    ).rejects.toMatchObject({ code: 'PAYMENT_PROVIDER_CREATE_REJECTED' });
  });

  it('treats verify codes 100 and 101 as PAID and never stores card_pan', async () => {
    const adapter = provider(async () =>
      jsonResponse({
        data: { code: 101, message: 'Verified', ref_id: 987654321, card_pan: '502229******5995' },
      }),
    );
    const outcome = await adapter.verifyReturn({
      providerRef: authority,
      amountMinor: 50_000n,
      currency: 'IRR',
    });
    expect(outcome.status).toBe('PAID');
    expect(outcome.providerTxnRef).toBe('987654321');
    expect(outcome.raw).toEqual({ code: 101, message: 'Verified' });
    expect(JSON.stringify(outcome.raw)).not.toContain('502229');
    expect(JSON.stringify(outcome.raw)).not.toContain('card_pan');
  });

  it('maps inquiry IN_BANK to PENDING and only verifies PAID/unverified authorities', async () => {
    const calls: string[] = [];
    const adapter = provider(async (url) => {
      calls.push(url);
      if (url.endsWith('/inquiry.json')) {
        return jsonResponse({ data: { code: 100, message: 'Success', status: 'IN_BANK' } });
      }
      return jsonResponse({ data: { code: 100, message: 'Verified', ref_id: 1 } });
    });
    const pending = await adapter.getStatus({
      providerRef: authority,
      amountMinor: 50_000n,
      currency: 'IRR',
    });
    expect(pending.status).toBe('PENDING');
    expect(calls.some((url) => url.endsWith('/verify.json'))).toBe(false);

    const paidCalls: string[] = [];
    const paidAdapter = provider(async (url) => {
      paidCalls.push(url);
      if (url.endsWith('/inquiry.json')) {
        return jsonResponse({ data: { code: 100, message: 'Success', status: 'PAID' } });
      }
      return jsonResponse({ data: { code: 100, message: 'Verified', ref_id: 2 } });
    });
    const paid = await paidAdapter.getStatus({
      providerRef: authority,
      amountMinor: 50_000n,
      currency: 'IRR',
    });
    expect(paid.status).toBe('PAID');
    expect(paidCalls.some((url) => url.endsWith('/verify.json'))).toBe(true);
  });

  it('maps inquiry FAILED/REVERSED/VERIFIED without calling verify', async () => {
    const failed = provider(async () =>
      jsonResponse({ data: { code: 100, message: 'ok', status: 'FAILED' } }),
    );
    expect(
      (await failed.getStatus({ providerRef: authority, amountMinor: 1n, currency: 'IRR' })).status,
    ).toBe('FAILED');
    const reversed = provider(async () =>
      jsonResponse({ data: { code: 100, message: 'ok', status: 'REVERSED' } }),
    );
    expect(
      (await reversed.getStatus({ providerRef: authority, amountMinor: 1n, currency: 'IRR' }))
        .status,
    ).toBe('CANCELLED');
    const verified = provider(async () =>
      jsonResponse({
        data: { code: 100, message: 'ok', status: 'VERIFIED', ref_id: 9, amount: 50000 },
      }),
    );
    const outcome = await verified.getStatus({
      providerRef: authority,
      amountMinor: 50_000n,
      currency: 'IRR',
    });
    expect(outcome.status).toBe('PAID');
    expect(outcome.amountMinor).toBe(50_000n);
  });

  it('sends merchant_id + authority on refund.json and rejects partial refunds', async () => {
    let captured:
      Readonly<{ url: string; body: Record<string, unknown>; authorization?: string }> | undefined;
    const adapter = provider(
      async (url, init) => {
        const authorization = init.headers['authorization'];
        captured = {
          url,
          body: JSON.parse(init.body) as Record<string, unknown>,
          ...(authorization === undefined ? {} : { authorization }),
        };
        return jsonResponse({ data: { code: 100, message: 'Refunded', ref_id: 44 } });
      },
      { accessToken: 'zarinpal-access-token', mode: 'production' },
    );
    await expect(
      adapter.refund({
        providerRef: authority,
        amountMinor: 1n,
        originalAmountMinor: 50_000n,
        currency: 'IRR',
      }),
    ).rejects.toMatchObject({ code: 'PAYMENT_PROVIDER_PARTIAL_REFUND_UNSUPPORTED' });
    const refunded = await adapter.refund({
      providerRef: authority,
      amountMinor: 50_000n,
      originalAmountMinor: 50_000n,
      currency: 'IRR',
    });
    expect(captured?.url).toBe('https://api.zarinpal.com/pg/v4/payment/refund.json');
    expect(captured?.body).toEqual({ merchant_id: merchantId, authority });
    expect(captured?.authorization).toBe('Bearer zarinpal-access-token');
    expect(refunded.status).toBe('COMPLETED');
  });

  it('maps network and malformed provider responses to dependency errors', async () => {
    const malformed = provider(async () => new Response('not-json', { status: 200 }));
    await expect(
      malformed.verifyReturn({ providerRef: authority, amountMinor: 1n, currency: 'IRR' }),
    ).rejects.toMatchObject({ code: 'PAYMENT_PROVIDER_RESPONSE_INVALID' });
    const unavailable = provider(async () => {
      throw new Error('socket hang up');
    });
    await expect(
      unavailable.getStatus({ providerRef: authority, amountMinor: 1n, currency: 'IRR' }),
    ).rejects.toMatchObject({ code: 'PAYMENT_PROVIDER_UNAVAILABLE', retryable: true });
  });
});
