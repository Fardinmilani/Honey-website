import { DependencyUnavailableAppError } from '../../../../../errors/index.js';
import type {
  CreatePaymentInput,
  CreatePaymentResult,
  GetStatusInput,
  PaymentJsonObject,
  PaymentOutcome,
  PaymentOutcomeStatus,
  PaymentProvider,
  ProviderCapabilities,
  ProviderReturnInput,
  RefundInput,
  RefundOutcome,
} from '../../../domain/payments.js';

export type ZarinpalConfig = Readonly<{
  merchantId: string;
  mode: 'sandbox' | 'production';
  /** Required only to enable the official REST refund. Null disables it honestly. */
  accessToken: string | null;
  requestTimeoutMs: number;
}>;

export type ZarinpalFetch = (
  input: string,
  init: Readonly<{
    method: string;
    headers: Readonly<Record<string, string>>;
    body: string;
    signal: AbortSignal;
  }>,
) => Promise<Response>;

const HOSTS = {
  production: {
    payment: 'https://payment.zarinpal.com',
    api: 'https://api.zarinpal.com',
  },
  sandbox: {
    payment: 'https://sandbox.zarinpal.com',
    api: 'https://sandbox.zarinpal.com',
  },
} as const;

const ALLOWED_ORIGINS = new Set([
  'https://payment.zarinpal.com',
  'https://api.zarinpal.com',
  'https://sandbox.zarinpal.com',
]);

type ZarinpalEnvelope = Readonly<{
  code: number;
  message: string;
  authority?: string;
  refId?: string;
  status?: string;
  amount?: number;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^-?[0-9]+$/u.test(value)) return Number(value);
  return null;
}

function asString(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function parseEnvelope(value: unknown, kind: string): ZarinpalEnvelope {
  if (!isRecord(value) || !isRecord(value['data'])) {
    throw new DependencyUnavailableAppError({ code: 'PAYMENT_PROVIDER_RESPONSE_INVALID' });
  }
  const data = value['data'];
  const code = asNumber(data['code']);
  const message = asString(data['message']) ?? '';
  if (code === null) {
    throw new DependencyUnavailableAppError({ code: 'PAYMENT_PROVIDER_RESPONSE_INVALID' });
  }
  const authority = asString(data['authority']);
  const refId = asString(data['ref_id']) ?? asString(data['refId']);
  const status = asString(data['status']);
  const amount = asNumber(data['amount']);
  return {
    code,
    message,
    ...(authority === null ? {} : { authority }),
    ...(refId === null ? {} : { refId }),
    ...(status === null ? {} : { status }),
    ...(amount === null ? {} : { amount }),
    ...(kind.length > 0 ? {} : {}),
  };
}

/**
 * Official Zarinpal REST v4 adapter.
 *
 * Sources (current official documentation, retrieved 2026-09-25 / rechecked 2026-10-04):
 * - https://www.zarinpal.com/docs/paymentGateway/connectToGateway
 * - https://www.zarinpal.com/docs/paymentGateway/otherMethods/Inquiry
 * - https://next.zarinpal.com/paymentGateway/other/
 * - https://www.zarinpal.com/docs/paymentGateway/sandBox
 *
 * Declared capabilities match that documentation only:
 * redirect + verifyReturn + getStatus (via inquiry, then verify when unpaid-but-paid);
 * no capture; no webhook; REST `refund.json` is full-refund only.
 */
export class ZarinpalPaymentProvider implements PaymentProvider {
  readonly code = 'zarinpal';
  readonly capabilities: ProviderCapabilities;
  readonly #fetch: ZarinpalFetch;

  constructor(
    private readonly config: ZarinpalConfig,
    fetchImpl: ZarinpalFetch = fetch,
  ) {
    this.#fetch = fetchImpl;
    this.capabilities = {
      redirect: true,
      capture: false,
      refund: config.accessToken !== null,
      partialRefund: false,
      webhooks: false,
      verifyReturn: true,
    };
  }

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const amount = this.#toAmount(input.amountMinor);
    const body: Record<string, unknown> = {
      merchant_id: this.config.merchantId,
      amount,
      currency: input.currency,
      callback_url: input.callbackUrl,
      description: input.description,
      metadata: {
        ...(input.customerEmail === null ? {} : { email: input.customerEmail }),
        ...(input.customerMobile === null ? {} : { mobile: input.customerMobile }),
        order_id: input.orderNumber,
      },
    };
    const parsed = parseEnvelope(
      await this.#post(this.#paymentUrl('/pg/v4/payment/request.json'), body),
      'request',
    );
    if (parsed.code !== 100 || parsed.authority === undefined) {
      throw new DependencyUnavailableAppError({
        code: 'PAYMENT_PROVIDER_CREATE_REJECTED',
        retryable: false,
      });
    }
    return {
      providerRef: parsed.authority,
      redirectUrl: this.redirectUrlFor(parsed.authority),
      raw: { code: parsed.code, message: parsed.message },
    };
  }

  redirectUrlFor(providerRef: string): string {
    return `${HOSTS[this.config.mode].payment}/pg/StartPay/${providerRef}`;
  }

  async verifyReturn(input: ProviderReturnInput): Promise<PaymentOutcome> {
    return this.#verify(input, 'VERIFIED_RETURN');
  }

  /**
   * Official inquiry is status-only and must not itself be treated as
   * verification. `PAID` (paid but not verified) therefore continues into
   * `verify.json`. `IN_BANK` stays `PENDING` so an in-flight customer is
   * never marked terminal FAILED.
   */
  async getStatus(input: GetStatusInput): Promise<PaymentOutcome> {
    const inquired = parseEnvelope(
      await this.#post(this.#paymentUrl('/pg/v4/payment/inquiry.json'), {
        merchant_id: this.config.merchantId,
        authority: input.providerRef,
      }),
      'inquiry',
    );
    const inquiryStatus = (inquired.status ?? '').toUpperCase();
    if (inquiryStatus === 'IN_BANK') {
      return this.#outcome(input, 'PENDING', 'RECONCILIATION', inquired, input.amountMinor);
    }
    if (inquiryStatus === 'FAILED') {
      return this.#outcome(
        input,
        'FAILED',
        'RECONCILIATION',
        inquired,
        this.#amountFrom(inquired, input.amountMinor),
      );
    }
    if (inquiryStatus === 'REVERSED') {
      return this.#outcome(
        input,
        'CANCELLED',
        'RECONCILIATION',
        inquired,
        this.#amountFrom(inquired, input.amountMinor),
      );
    }
    if (inquiryStatus === 'VERIFIED') {
      return this.#outcome(
        input,
        'PAID',
        'RECONCILIATION',
        inquired,
        this.#amountFrom(inquired, input.amountMinor),
      );
    }
    if (inquiryStatus === 'PAID') {
      return this.#verify(input, 'RECONCILIATION');
    }
    if (inquired.code === 100 || inquired.code === 101) {
      return this.#verify(input, 'RECONCILIATION');
    }
    return this.#outcome(input, 'PENDING', 'RECONCILIATION', inquired, input.amountMinor);
  }

  async refund(input: RefundInput): Promise<RefundOutcome> {
    if (this.config.accessToken === null) {
      throw new DependencyUnavailableAppError({ code: 'PAYMENT_PROVIDER_REFUND_NOT_CONFIGURED' });
    }
    if (input.amountMinor !== input.originalAmountMinor) {
      throw new DependencyUnavailableAppError({
        code: 'PAYMENT_PROVIDER_PARTIAL_REFUND_UNSUPPORTED',
      });
    }
    const parsed = parseEnvelope(
      await this.#post(
        this.#apiUrl('/pg/v4/payment/refund.json'),
        { merchant_id: this.config.merchantId, authority: input.providerRef },
        { authorization: `Bearer ${this.config.accessToken}` },
      ),
      'refund',
    );
    if (parsed.code !== 100 && parsed.code !== 200) {
      return {
        status: 'FAILED',
        providerRefundRef: null,
        amountMinor: input.amountMinor,
        occurredAt: new Date(),
        raw: { code: parsed.code, message: parsed.message },
      };
    }
    return {
      status: 'COMPLETED',
      providerRefundRef: parsed.refId ?? null,
      amountMinor: input.amountMinor,
      occurredAt: new Date(),
      raw: { code: parsed.code, message: parsed.message },
    };
  }

  async #verify(
    input: Readonly<{ providerRef: string; amountMinor: bigint; currency: string }>,
    source: 'VERIFIED_RETURN' | 'RECONCILIATION',
  ): Promise<PaymentOutcome> {
    const parsed = parseEnvelope(
      await this.#post(this.#paymentUrl('/pg/v4/payment/verify.json'), {
        merchant_id: this.config.merchantId,
        amount: this.#toAmount(input.amountMinor),
        authority: input.providerRef,
      }),
      'verify',
    );
    return this.#outcome(input, this.#statusFor(parsed.code), source, parsed, input.amountMinor);
  }

  #outcome(
    input: Readonly<{ providerRef: string; amountMinor: bigint; currency: string }>,
    status: PaymentOutcomeStatus,
    source: PaymentOutcome['source'],
    parsed: ZarinpalEnvelope,
    amountMinor: bigint,
  ): PaymentOutcome {
    const raw: PaymentJsonObject = { code: parsed.code, message: parsed.message };
    return {
      providerRef: input.providerRef,
      status,
      amountMinor,
      currency: input.currency,
      providerTxnRef: parsed.refId ?? null,
      occurredAt: new Date(),
      source,
      raw,
    };
  }

  #statusFor(code: number): PaymentOutcomeStatus {
    if (code === 100 || code === 101) return 'PAID';
    return 'FAILED';
  }

  #amountFrom(parsed: ZarinpalEnvelope, fallback: bigint): bigint {
    return parsed.amount === undefined ? fallback : BigInt(parsed.amount);
  }

  #toAmount(amountMinor: bigint): number {
    if (amountMinor <= 0n || amountMinor > 500_000_000_000n) {
      throw new TypeError('Payment amount is outside the supported range.');
    }
    return Number(amountMinor);
  }

  #paymentUrl(path: string): string {
    return `${HOSTS[this.config.mode].payment}${path}`;
  }

  #apiUrl(path: string): string {
    return `${HOSTS[this.config.mode].api}${path}`;
  }

  async #post(
    url: string,
    body: Record<string, unknown>,
    extraHeaders: Readonly<Record<string, string>> = {},
  ): Promise<unknown> {
    const origin = new URL(url).origin;
    if (!ALLOWED_ORIGINS.has(origin)) {
      throw new DependencyUnavailableAppError({ code: 'PAYMENT_PROVIDER_UNAVAILABLE' });
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);
    try {
      const response = await this.#fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          ...extraHeaders,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await response.text();
      try {
        return JSON.parse(text) as unknown;
      } catch {
        throw new DependencyUnavailableAppError({ code: 'PAYMENT_PROVIDER_RESPONSE_INVALID' });
      }
    } catch (error) {
      if (error instanceof DependencyUnavailableAppError) throw error;
      throw new DependencyUnavailableAppError({
        code: 'PAYMENT_PROVIDER_UNAVAILABLE',
        retryable: true,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}
