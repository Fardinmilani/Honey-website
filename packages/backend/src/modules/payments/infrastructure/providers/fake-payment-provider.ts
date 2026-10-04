import { createHmac, randomUUID } from 'node:crypto';

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
  RawWebhook,
  RefundInput,
  RefundOutcome,
  VerifiedWebhookEvent,
} from '../../domain/payments.js';

export type FakeProviderScenario = Readonly<{
  status: PaymentOutcomeStatus;
  providerTxnRef?: string;
  amountMinor?: bigint;
  currency?: string;
  providerRef?: string;
}>;

type StoredState = Readonly<{
  amountMinor: bigint;
  currency: string;
  scenario: FakeProviderScenario;
}>;

export const FAKE_WEBHOOK_SECRET = 'fake-provider-webhook-secret-test-only';
const WEBHOOK_MAX_SKEW_MS = 5 * 60 * 1_000;

/**
 * Deterministic, fully in-memory `PaymentProvider` used by unit and
 * integration tests. It never performs network I/O. Tests drive its
 * behaviour explicitly with `setOutcome` rather than relying on timing.
 */
export class FakePaymentProvider implements PaymentProvider {
  readonly code: string;
  readonly capabilities: ProviderCapabilities;
  readonly #states = new Map<string, StoredState>();
  #failNextCreate = false;

  constructor(
    options: Readonly<{
      code?: string;
      webhooks?: boolean;
      partialRefund?: boolean;
      refund?: boolean;
    }> = {},
  ) {
    this.code = options.code ?? 'mock';
    this.capabilities = {
      redirect: true,
      capture: false,
      refund: options.refund ?? true,
      partialRefund: options.partialRefund ?? true,
      webhooks: options.webhooks ?? true,
      verifyReturn: true,
    };
    if (this.capabilities.webhooks) {
      this.parseWebhook = this.#parseWebhook.bind(this);
    }
  }

  static providerRefFor(paymentId: string): string {
    return `fake_${paymentId}`;
  }

  setOutcome(providerRef: string, scenario: FakeProviderScenario): void {
    const existing = this.#states.get(providerRef);
    if (existing === undefined) throw new Error('Unknown fake payment reference.');
    this.#states.set(providerRef, { ...existing, scenario });
  }

  failNextCreate(): void {
    this.#failNextCreate = true;
  }

  signedWebhook(
    providerRef: string,
    options: Readonly<{
      eventId?: string;
      status?: PaymentOutcomeStatus;
      timestampMs?: number;
      signature?: string | null;
    }> = {},
  ): RawWebhook {
    const state = this.#states.get(providerRef);
    if (state === undefined) throw new Error('Unknown fake payment reference.');
    const status = options.status ?? state.scenario.status;
    const body = JSON.stringify({
      eventId: options.eventId ?? randomUUID(),
      providerRef,
      status,
      providerTxnRef: state.scenario.providerTxnRef ?? null,
    });
    const signature =
      options.signature === undefined
        ? createHmac('sha256', FAKE_WEBHOOK_SECRET).update(body, 'utf8').digest('hex')
        : options.signature;
    const timestamp = String(options.timestampMs ?? Date.now());
    return {
      rawBody: new TextEncoder().encode(body),
      headers: {
        ...(signature === null ? {} : { 'x-fake-signature': signature }),
        'x-fake-timestamp': timestamp,
      },
    };
  }

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    if (this.#failNextCreate) {
      this.#failNextCreate = false;
      throw new Error('Fake provider: simulated network failure.');
    }
    const providerRef = FakePaymentProvider.providerRefFor(input.paymentId);
    this.#states.set(providerRef, {
      amountMinor: input.amountMinor,
      currency: input.currency,
      scenario: { status: 'PENDING' },
    });
    return {
      providerRef,
      redirectUrl: `https://fake-gateway.invalid/pay/${providerRef}`,
      raw: { providerRef },
    };
  }

  redirectUrlFor(providerRef: string): string | null {
    return this.#states.has(providerRef) ? `https://fake-gateway.invalid/pay/${providerRef}` : null;
  }

  async verifyReturn(input: ProviderReturnInput): Promise<PaymentOutcome> {
    return this.#outcome(input.providerRef, 'VERIFIED_RETURN');
  }

  async getStatus(input: GetStatusInput): Promise<PaymentOutcome> {
    return this.#outcome(input.providerRef, 'RECONCILIATION');
  }

  async refund(input: RefundInput): Promise<RefundOutcome> {
    if (!this.capabilities.refund) throw new Error('Fake provider does not support refunds.');
    if (!this.capabilities.partialRefund && input.amountMinor !== input.originalAmountMinor) {
      throw new Error('Fake provider does not support partial refunds.');
    }
    return {
      status: 'COMPLETED',
      providerRefundRef: `fake_refund_${input.providerRef}`,
      amountMinor: input.amountMinor,
      occurredAt: new Date(),
      raw: { providerRef: input.providerRef },
    };
  }

  parseWebhook?: (raw: RawWebhook) => Promise<VerifiedWebhookEvent>;

  async #parseWebhook(raw: RawWebhook): Promise<VerifiedWebhookEvent> {
    const text = new TextDecoder().decode(raw.rawBody);
    const expected = createHmac('sha256', FAKE_WEBHOOK_SECRET).update(text, 'utf8').digest('hex');
    const signature = raw.headers['x-fake-signature'];
    const timestampHeader = raw.headers['x-fake-timestamp'];
    if (timestampHeader !== undefined) {
      const timestamp = Number(timestampHeader);
      if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > WEBHOOK_MAX_SKEW_MS) {
        throw new Error('Stale fake webhook timestamp.');
      }
    }
    const signatureValid =
      typeof signature === 'string' &&
      signature.length === expected.length &&
      signature === expected;
    if (!signatureValid) throw new Error('Invalid fake webhook signature.');
    const parsed: unknown = JSON.parse(text);
    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      !('providerRef' in parsed) ||
      !('eventId' in parsed) ||
      typeof parsed.providerRef !== 'string' ||
      typeof parsed.eventId !== 'string'
    ) {
      throw new Error('Malformed fake webhook body.');
    }
    if ('status' in parsed && typeof parsed.status === 'string') {
      const status = parsed.status;
      if (
        status === 'PENDING' ||
        status === 'AUTHORIZED' ||
        status === 'PAID' ||
        status === 'FAILED' ||
        status === 'CANCELLED' ||
        status === 'EXPIRED'
      ) {
        const existing = this.#states.get(parsed.providerRef);
        if (existing !== undefined) {
          this.#states.set(parsed.providerRef, {
            ...existing,
            scenario: { ...existing.scenario, status },
          });
        }
      }
    }
    const outcome = await this.#outcome(parsed.providerRef, 'VERIFIED_WEBHOOK');
    return { eventId: parsed.eventId, type: 'payment.status_changed', outcome };
  }

  async #outcome(providerRef: string, source: PaymentOutcome['source']): Promise<PaymentOutcome> {
    const state = this.#states.get(providerRef);
    if (state === undefined) throw new Error('Unknown fake payment reference.');
    const raw: PaymentJsonObject = { providerRef, status: state.scenario.status };
    return {
      providerRef: state.scenario.providerRef ?? providerRef,
      status: state.scenario.status,
      amountMinor: state.scenario.amountMinor ?? state.amountMinor,
      currency: state.scenario.currency ?? state.currency,
      providerTxnRef: state.scenario.providerTxnRef ?? null,
      occurredAt: new Date(),
      source,
      raw,
    };
  }
}
