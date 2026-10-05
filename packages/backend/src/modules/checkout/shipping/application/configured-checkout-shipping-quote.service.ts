import { createHash, randomUUID } from 'node:crypto';

import { ConflictAppError, DependencyUnavailableAppError } from '../../../../errors/index.js';
import type { ShippingMethodQuote, ShippingService } from '../../../shipping/index.js';
import {
  type CheckoutShippingOption,
  type CheckoutShippingQuotePort,
  type CheckoutShippingQuoteRepository,
  type CheckoutShippingQuoteRevalidation,
  type SelectCheckoutShippingQuoteInput,
  type SelectedCheckoutShippingQuote,
} from '../domain/checkout-shipping-quote.port.js';
import {
  calculateStandardShippingCharge,
  type StandardShippingQuote,
  type StandardShippingQuoteDraft,
  type StoredShippingQuote,
} from '../domain/standard-shipping-quote.js';
import type { StandardShippingQuoteService } from './standard-shipping-quote.service.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function requiredInput(input: SelectCheckoutShippingQuoteInput) {
  if (
    input.destination === undefined ||
    input.locale === undefined ||
    input.merchandiseSubtotalMinor === undefined ||
    input.weightGrams === undefined
  ) {
    throw new TypeError('Checkout shipping context is incomplete.');
  }
  return {
    destination: input.destination,
    locale: input.locale,
    merchandiseSubtotalMinor: input.merchandiseSubtotalMinor,
    weightGrams: input.weightGrams,
  };
}

function contextFingerprint(input: SelectCheckoutShippingQuoteInput): string {
  const context = requiredInput(input);
  return createHash('sha256')
    .update(
      JSON.stringify({
        checkoutSessionId: input.checkoutSessionId,
        destination: context.destination,
        locale: context.locale,
        currency: input.checkoutCurrency,
        subtotalMinor: context.merchandiseSubtotalMinor.toString(),
        weightGrams: context.weightGrams,
      }),
      'utf8',
    )
    .digest('hex');
}

function asQuote(value: StoredShippingQuote): StandardShippingQuote {
  return {
    id: value.id,
    checkoutSessionId: value.checkoutSessionId,
    methodCode: value.methodCode,
    amountMinor: value.amountMinor,
    currency: value.currency,
    estimatedDaysMin: value.estimatedDaysMin,
    estimatedDaysMax: value.estimatedDaysMax,
    expiresAt: value.expiresAt,
    createdAt: value.createdAt,
  };
}

function asOption(
  value: StoredShippingQuote,
  freeShippingApplies: boolean,
): CheckoutShippingOption {
  const quote = asQuote(value);
  return {
    quote,
    name: value.methodName ?? quote.methodCode,
    providerCode: value.providerCode ?? 'manual-flat',
    charge: calculateStandardShippingCharge(quote, freeShippingApplies),
  };
}

function unavailable(): DependencyUnavailableAppError {
  return new DependencyUnavailableAppError({
    code: 'CHECKOUT_SHIPPING_CONFIGURATION_UNAVAILABLE',
    retryable: false,
  });
}

export class ConfiguredCheckoutShippingQuoteService implements CheckoutShippingQuotePort {
  constructor(
    private readonly repository: CheckoutShippingQuoteRepository,
    private readonly shipping: ShippingService,
    private readonly legacy: StandardShippingQuoteService,
    private readonly clock: () => Date = () => new Date(),
    private readonly createId: () => string = randomUUID,
  ) {}

  async selectForCheckout(
    input: SelectCheckoutShippingQuoteInput,
  ): Promise<SelectedCheckoutShippingQuote> {
    const quotes = await this.#rates(input);
    if (quotes.length === 0) return this.legacy.selectForCheckout(input);
    const selected = quotes.find((quote) => quote.methodCode === 'STANDARD') ?? quotes[0];
    if (selected === undefined) throw unavailable();
    const options = await this.#persist(input, quotes, selected.methodCode);
    return this.#selected(options, selected.methodCode);
  }

  async revalidateForConfirmation(
    input: SelectCheckoutShippingQuoteInput,
  ): Promise<CheckoutShippingQuoteRevalidation> {
    const rates = await this.#rates(input);
    if (rates.length === 0) return this.legacy.revalidateForConfirmation(input);
    const existing = await this.repository.lockSelected(input.checkoutSessionId, input.transaction);
    const preferred =
      rates.find((rate) => rate.methodCode === existing?.methodCode) ??
      rates.find((rate) => rate.methodCode === 'STANDARD') ??
      rates[0];
    if (preferred === undefined) throw unavailable();
    const current = await this.#currentOptions(input, rates);
    if (current !== null && existing !== null) {
      const selected = current.find((option) => option.quote.id === existing.id);
      if (selected !== undefined) {
        return {
          state: 'CURRENT',
          quote: selected.quote,
          charge: selected.charge,
          options: current,
          name: selected.name,
          providerCode: selected.providerCode,
        };
      }
    }
    const options = await this.#persist(input, rates, preferred.methodCode);
    const selected = this.#selected(options, preferred.methodCode);
    return {
      state: 'REQUOTED',
      quote: selected.quote,
      previousQuote: existing,
      charge: selected.charge,
      options,
      name: selected.name ?? selected.quote.methodCode,
      providerCode: selected.providerCode ?? 'manual-flat',
      requiresReconfirmation:
        existing === null ||
        existing.methodCode !== selected.quote.methodCode ||
        existing.amountMinor !== selected.quote.amountMinor ||
        existing.currency !== selected.quote.currency,
    };
  }

  async selectById(
    input: SelectCheckoutShippingQuoteInput & Readonly<{ quoteId: string }>,
  ): Promise<SelectedCheckoutShippingQuote> {
    if (!UUID.test(input.quoteId)) {
      throw new ConflictAppError({ code: 'CHECKOUT_SHIPPING_QUOTE_INVALID' });
    }
    const candidate = await this.repository.findForCheckout?.(
      input.checkoutSessionId,
      input.quoteId,
      input.transaction,
    );
    if (candidate === undefined || candidate === null) {
      throw new ConflictAppError({ code: 'CHECKOUT_SHIPPING_QUOTE_INVALID' });
    }
    const rates = await this.#rates(input);
    if (rates.length === 0) {
      if (candidate.methodCode !== 'STANDARD') {
        throw new ConflictAppError({ code: 'CHECKOUT_SHIPPING_METHOD_UNAVAILABLE' });
      }
      const revalidated = await this.legacy.revalidateForConfirmation(input);
      return {
        quote: revalidated.quote,
        charge: revalidated.charge,
        name: 'STANDARD',
        providerCode: 'manual-flat',
        options: [
          asOption(
            { ...revalidated.quote, methodName: 'STANDARD', providerCode: 'manual-flat' },
            input.freeShippingApplies,
          ),
        ],
      };
    }
    if (!rates.some((rate) => rate.methodCode === candidate.methodCode)) {
      throw new ConflictAppError({ code: 'CHECKOUT_SHIPPING_METHOD_UNAVAILABLE' });
    }
    const current = await this.#currentOptions(input, rates);
    if (current !== null) {
      const option = current.find((value) => value.quote.id === input.quoteId);
      if (option !== undefined) {
        await this.repository.selectExisting?.(
          input.checkoutSessionId,
          option.quote.id,
          input.actorUserId,
          input.transaction,
        );
        return {
          quote: option.quote,
          charge: option.charge,
          name: option.name,
          providerCode: option.providerCode,
          options: current,
        };
      }
    }
    const options = await this.#persist(input, rates, candidate.methodCode);
    return this.#selected(options, candidate.methodCode);
  }

  async #rates(input: SelectCheckoutShippingQuoteInput): Promise<readonly ShippingMethodQuote[]> {
    const context = requiredInput(input);
    return this.shipping.quote(
      {
        destination: context.destination,
        currency: input.checkoutCurrency,
        locale: context.locale,
        merchandiseSubtotalMinor: context.merchandiseSubtotalMinor,
        weightGrams: context.weightGrams,
        now: this.clock(),
      },
      input.transaction,
    );
  }

  async #currentOptions(
    input: SelectCheckoutShippingQuoteInput,
    rates: readonly ShippingMethodQuote[],
  ): Promise<readonly CheckoutShippingOption[] | null> {
    const now = this.clock();
    const stored = await this.repository.listCurrentForCheckout?.(
      input.checkoutSessionId,
      contextFingerprint(input),
      now,
      input.transaction,
    );
    if (stored === undefined || stored.length !== rates.length) return null;
    for (const rate of rates) {
      const quote = stored.find((value) => value.methodCode === rate.methodCode);
      if (
        quote === undefined ||
        quote.amountMinor !== rate.amountMinor ||
        quote.currency !== rate.currency ||
        quote.methodName !== rate.methodName ||
        quote.providerCode !== rate.providerCode ||
        quote.expiresAt.getTime() !== input.expiresAt.getTime()
      ) {
        return null;
      }
    }
    return stored.map((quote) => asOption(quote, input.freeShippingApplies));
  }

  async #persist(
    input: SelectCheckoutShippingQuoteInput,
    rates: readonly ShippingMethodQuote[],
    selectedMethodCode: string,
  ): Promise<readonly CheckoutShippingOption[]> {
    if (this.repository.createOptionsAndSelect === undefined) throw unavailable();
    const now = this.clock();
    if (input.expiresAt.getTime() <= now.getTime()) {
      throw new ConflictAppError({ code: 'CHECKOUT_SHIPPING_QUOTE_EXPIRED' });
    }
    const fingerprint = contextFingerprint(input);
    const drafts: readonly StandardShippingQuoteDraft[] = rates.map((rate) => ({
      id: this.createId(),
      checkoutSessionId: input.checkoutSessionId,
      methodCode: rate.methodCode,
      amountMinor: rate.amountMinor,
      currency: rate.currency,
      estimatedDaysMin: rate.estimatedDaysMin,
      estimatedDaysMax: rate.estimatedDaysMax,
      expiresAt: input.expiresAt,
      createdAt: now,
      actorUserId: input.actorUserId,
      contextFingerprint: fingerprint,
      methodName: rate.methodName,
      providerCode: rate.providerCode,
    }));
    const selected = drafts.find((quote) => quote.methodCode === selectedMethodCode);
    if (selected === undefined) throw unavailable();
    const stored = await this.repository.createOptionsAndSelect(
      drafts,
      selected.id,
      input.transaction,
    );
    return stored.map((quote) => asOption(quote, input.freeShippingApplies));
  }

  #selected(
    options: readonly CheckoutShippingOption[],
    methodCode: string,
  ): SelectedCheckoutShippingQuote {
    const selected = options.find((option) => option.quote.methodCode === methodCode);
    if (selected === undefined) throw unavailable();
    return {
      quote: selected.quote,
      charge: selected.charge,
      options,
      name: selected.name,
      providerCode: selected.providerCode,
    };
  }
}
