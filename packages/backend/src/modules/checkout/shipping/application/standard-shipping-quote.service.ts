import { randomUUID } from 'node:crypto';

import { ConflictAppError, DependencyUnavailableAppError } from '../../../../errors/index.js';
import { assertNonNegativeMinor, normalizeCurrency } from '../../../pricing/index.js';
import {
  type CheckoutShippingQuotePort,
  type CheckoutShippingQuoteRepository,
  type CheckoutShippingQuoteRevalidation,
  type RevalidateCheckoutShippingQuoteInput,
  type SelectedCheckoutShippingQuote,
  type SelectCheckoutShippingQuoteInput,
} from '../domain/checkout-shipping-quote.port.js';
import {
  calculateStandardShippingCharge,
  isConfiguredStandardShippingQuote,
  STANDARD_SHIPPING_ESTIMATED_DAYS_MAX,
  STANDARD_SHIPPING_ESTIMATED_DAYS_MIN,
  STANDARD_SHIPPING_METHOD_CODE,
  type StandardShippingQuote,
  type StandardShippingQuoteConfiguration,
  type StandardShippingQuoteDraft,
  type StoredShippingQuote,
} from '../domain/standard-shipping-quote.js';

const MAX_POSTGRES_BIGINT = 9_223_372_036_854_775_807n;

export type ShippingQuoteClock = () => Date;
export type ShippingQuoteIdGenerator = () => string;

/**
 * Phase 13's only shipping adapter. It reads exactly one server-owned
 * STANDARD rate and persists a selected quote; it does not resolve carriers,
 * zones, parcel rules, or fulfillment.
 */
export class StandardShippingQuoteService implements CheckoutShippingQuotePort {
  constructor(
    private readonly repository: CheckoutShippingQuoteRepository,
    private readonly config: StandardShippingQuoteConfiguration,
    private readonly clock: ShippingQuoteClock = () => new Date(),
    private readonly createId: ShippingQuoteIdGenerator = randomUUID,
  ) {}

  async selectForCheckout(
    input: SelectCheckoutShippingQuoteInput,
  ): Promise<SelectedCheckoutShippingQuote> {
    const draft = this.#draft(input, this.#now());
    const quote = await this.repository.createAndSelect(draft, input.transaction);
    return { quote, charge: calculateStandardShippingCharge(quote, input.freeShippingApplies) };
  }

  async revalidateForConfirmation(
    input: RevalidateCheckoutShippingQuoteInput,
  ): Promise<CheckoutShippingQuoteRevalidation> {
    const now = this.#now();
    const configuration = this.#configuration(input.checkoutCurrency);
    const existing = await this.repository.lockSelected(input.checkoutSessionId, input.transaction);

    if (existing !== null && this.#isCurrent(existing, configuration, input.expiresAt, now)) {
      const quote = this.#asStandardQuote(existing);
      return {
        state: 'CURRENT',
        quote,
        charge: calculateStandardShippingCharge(quote, input.freeShippingApplies),
      };
    }

    const draft = this.#draftWithConfiguration(input, now, configuration);
    const quote = await this.repository.createAndSelect(draft, input.transaction);
    return {
      state: 'REQUOTED',
      quote,
      previousQuote: existing,
      charge: calculateStandardShippingCharge(quote, input.freeShippingApplies),
      requiresReconfirmation:
        existing === null ||
        existing.methodCode !== quote.methodCode ||
        existing.amountMinor !== quote.amountMinor ||
        normalizeCurrency(existing.currency) !== quote.currency,
    };
  }

  #draft(input: SelectCheckoutShippingQuoteInput, now: Date): StandardShippingQuoteDraft {
    return this.#draftWithConfiguration(input, now, this.#configuration(input.checkoutCurrency));
  }

  #draftWithConfiguration(
    input: SelectCheckoutShippingQuoteInput,
    now: Date,
    configuration: Readonly<{ amountMinor: bigint; currency: string }>,
  ): StandardShippingQuoteDraft {
    const checkoutSessionId = identifier(input.checkoutSessionId, 'checkoutSessionId');
    const expiresAt = futureTimestamp(input.expiresAt, now, 'expiresAt');
    const id = identifier(this.createId(), 'shippingQuoteId');
    return {
      id,
      checkoutSessionId,
      methodCode: STANDARD_SHIPPING_METHOD_CODE,
      amountMinor: configuration.amountMinor,
      currency: configuration.currency,
      estimatedDaysMin: STANDARD_SHIPPING_ESTIMATED_DAYS_MIN,
      estimatedDaysMax: STANDARD_SHIPPING_ESTIMATED_DAYS_MAX,
      expiresAt,
      createdAt: now,
      actorUserId: input.actorUserId,
    };
  }

  #configuration(checkoutCurrency: string): Readonly<{ amountMinor: bigint; currency: string }> {
    if (!isConfiguredStandardShippingQuote(this.config)) {
      throw unavailableConfiguration();
    }
    try {
      const amountMinor = assertNonNegativeMinor(
        this.config.amountMinor,
        'standard shipping amount',
      );
      if (amountMinor > MAX_POSTGRES_BIGINT) throw new RangeError('Shipping amount is too large.');
      const currency = normalizeCurrency(this.config.currency);
      if (currency !== normalizeCurrency(checkoutCurrency)) {
        throw new ConflictAppError({ code: 'CHECKOUT_SHIPPING_CURRENCY_MISMATCH' });
      }
      return { amountMinor, currency };
    } catch (error) {
      if (error instanceof ConflictAppError) throw error;
      throw unavailableConfiguration();
    }
  }

  #isCurrent(
    quote: StoredShippingQuote,
    configuration: Readonly<{ amountMinor: bigint; currency: string }>,
    expectedExpiry: Date,
    now: Date,
  ): boolean {
    return (
      quote.methodCode === STANDARD_SHIPPING_METHOD_CODE &&
      quote.amountMinor === configuration.amountMinor &&
      normalizeCurrency(quote.currency) === configuration.currency &&
      quote.estimatedDaysMin === STANDARD_SHIPPING_ESTIMATED_DAYS_MIN &&
      quote.estimatedDaysMax === STANDARD_SHIPPING_ESTIMATED_DAYS_MAX &&
      timestamp(quote.expiresAt, 'stored quote expiresAt') > timestamp(now, 'now') &&
      timestamp(quote.expiresAt, 'stored quote expiresAt') ===
        timestamp(expectedExpiry, 'expiresAt')
    );
  }

  #asStandardQuote(quote: StoredShippingQuote): StandardShippingQuote {
    if (
      quote.methodCode !== STANDARD_SHIPPING_METHOD_CODE ||
      quote.estimatedDaysMin !== STANDARD_SHIPPING_ESTIMATED_DAYS_MIN ||
      quote.estimatedDaysMax !== STANDARD_SHIPPING_ESTIMATED_DAYS_MAX
    ) {
      throw new TypeError('Stored shipping quote is not a Phase 13 STANDARD quote.');
    }
    return {
      id: identifier(quote.id, 'shippingQuoteId'),
      checkoutSessionId: identifier(quote.checkoutSessionId, 'checkoutSessionId'),
      methodCode: STANDARD_SHIPPING_METHOD_CODE,
      amountMinor: assertNonNegativeMinor(quote.amountMinor, 'shipping quote amount'),
      currency: normalizeCurrency(quote.currency),
      estimatedDaysMin: STANDARD_SHIPPING_ESTIMATED_DAYS_MIN,
      estimatedDaysMax: STANDARD_SHIPPING_ESTIMATED_DAYS_MAX,
      expiresAt: validDate(quote.expiresAt, 'stored quote expiresAt'),
      createdAt: validDate(quote.createdAt, 'stored quote createdAt'),
    };
  }

  #now(): Date {
    return validDate(this.clock(), 'now');
  }
}

function unavailableConfiguration(): DependencyUnavailableAppError {
  return new DependencyUnavailableAppError({
    code: 'CHECKOUT_SHIPPING_CONFIGURATION_UNAVAILABLE',
    retryable: false,
  });
}

function identifier(value: string, field: string): string {
  const normalized = value.normalize('NFC').trim();
  if (
    normalized.length < 1 ||
    normalized.length > 255 ||
    /[\u0000-\u001F\u007F-\u009F]/u.test(normalized)
  ) {
    throw new TypeError(`${field} is invalid.`);
  }
  return normalized;
}

function timestamp(value: Date, field: string): number {
  const milliseconds = value.getTime();
  if (!Number.isFinite(milliseconds)) throw new TypeError(`${field} is invalid.`);
  return milliseconds;
}

function validDate(value: Date, field: string): Date {
  return new Date(timestamp(value, field));
}

function futureTimestamp(value: Date, now: Date, field: string): Date {
  const milliseconds = timestamp(value, field);
  if (milliseconds <= timestamp(now, 'now')) {
    throw new ConflictAppError({ code: 'CHECKOUT_SHIPPING_QUOTE_EXPIRED' });
  }
  return new Date(milliseconds);
}
