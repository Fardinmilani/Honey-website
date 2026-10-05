import { describe, expect, it } from 'vitest';

import { TransactionContext } from '../../../../platform/domain/transaction.js';
import {
  ShippingService,
  ManualFlatShippingProvider,
  type ShippingConfiguration,
  type ShippingConfigurationRepository,
} from '../../../shipping/index.js';
import type {
  CheckoutShippingQuoteRepository,
  SelectCheckoutShippingQuoteInput,
} from '../domain/checkout-shipping-quote.port.js';
import type {
  StandardShippingQuote,
  StandardShippingQuoteDraft,
  StoredShippingQuote,
} from '../domain/standard-shipping-quote.js';
import { StandardShippingQuoteService } from './standard-shipping-quote.service.js';
import { ConfiguredCheckoutShippingQuoteService } from './configured-checkout-shipping-quote.service.js';

const CHECKOUT_ID = '018f0000-0000-7000-8000-000000000301';
const NOW = new Date('2026-10-04T12:00:00.000Z');

class MemoryTransaction extends TransactionContext {}

class MemoryConfiguration implements ShippingConfigurationRepository {
  constructor(readonly value: ShippingConfiguration) {}
  async loadConfiguration(): Promise<ShippingConfiguration> {
    return this.value;
  }
  async close(): Promise<void> {}
}

class MemoryQuotes implements CheckoutShippingQuoteRepository {
  readonly quotes = new Map<string, StoredShippingQuote>();
  selectedId: string | null = null;

  async createAndSelect(quote: StandardShippingQuoteDraft): Promise<StandardShippingQuote> {
    const stored = this.store(quote);
    this.selectedId = stored.id;
    return stored;
  }

  async createOptionsAndSelect(
    quotes: readonly StandardShippingQuoteDraft[],
    selectedQuoteId: string,
  ): Promise<readonly StoredShippingQuote[]> {
    const stored = quotes.map((quote) => this.store(quote));
    this.selectedId = selectedQuoteId;
    return stored;
  }

  async lockSelected(): Promise<StoredShippingQuote | null> {
    return this.selectedId === null ? null : (this.quotes.get(this.selectedId) ?? null);
  }

  async findForCheckout(
    checkoutSessionId: string,
    quoteId: string,
  ): Promise<StoredShippingQuote | null> {
    const quote = this.quotes.get(quoteId);
    return quote?.checkoutSessionId === checkoutSessionId ? quote : null;
  }

  async listCurrentForCheckout(
    checkoutSessionId: string,
    fingerprint: string,
    now: Date,
  ): Promise<readonly StoredShippingQuote[]> {
    return [...this.quotes.values()].filter(
      (quote) =>
        quote.checkoutSessionId === checkoutSessionId &&
        quote.contextFingerprint === fingerprint &&
        quote.expiresAt.getTime() > now.getTime(),
    );
  }

  async selectExisting(checkoutSessionId: string, quoteId: string): Promise<void> {
    if ((await this.findForCheckout(checkoutSessionId, quoteId)) === null)
      throw new Error('Missing quote.');
    this.selectedId = quoteId;
  }

  async close(): Promise<void> {}

  private store(quote: StandardShippingQuoteDraft): StoredShippingQuote {
    const stored: StoredShippingQuote = {
      id: quote.id,
      checkoutSessionId: quote.checkoutSessionId,
      methodCode: quote.methodCode,
      amountMinor: quote.amountMinor,
      currency: quote.currency,
      estimatedDaysMin: quote.estimatedDaysMin,
      estimatedDaysMax: quote.estimatedDaysMax,
      expiresAt: quote.expiresAt,
      createdAt: quote.createdAt,
      contextFingerprint: quote.contextFingerprint ?? null,
      methodName: quote.methodName ?? null,
      providerCode: quote.providerCode ?? null,
    };
    this.quotes.set(stored.id, stored);
    return stored;
  }
}

function configuration(standardAmount: bigint): ShippingConfiguration {
  const rate = (id: string, baseMinor: bigint) => ({
    id,
    currency: 'IRR',
    baseMinor,
    perKgMinor: 0n,
    freeOverSubtotalMinor: null,
    minWeightGrams: 0,
    maxWeightGrams: null,
    validFrom: new Date('2026-01-01T00:00:00.000Z'),
    validTo: null,
  });
  return {
    zones: [{ id: 'zone', countries: ['IR'], provinces: [], priority: 0 }],
    methods: [
      {
        code: 'STANDARD',
        zoneId: 'zone',
        providerCode: 'manual-flat',
        isActive: true,
        sortOrder: 0,
        translations: [{ locale: 'en', name: 'Standard' }],
        rates: [rate('standard', standardAmount)],
      },
      {
        code: 'EXPRESS',
        zoneId: 'zone',
        providerCode: 'manual-flat',
        isActive: true,
        sortOrder: 1,
        translations: [{ locale: 'en', name: 'Express' }],
        rates: [rate('express', 20_000n)],
      },
    ],
  };
}

function input(): SelectCheckoutShippingQuoteInput {
  return {
    checkoutSessionId: CHECKOUT_ID,
    checkoutCurrency: 'IRR',
    expiresAt: new Date(NOW.getTime() + 15 * 60_000),
    actorUserId: null,
    freeShippingApplies: false,
    destination: { country: 'IR', province: 'Tehran' },
    locale: 'en',
    merchandiseSubtotalMinor: 50_000n,
    weightGrams: 500,
    transaction: new MemoryTransaction(),
  };
}

function service(repository: MemoryQuotes, configurationRepository: MemoryConfiguration) {
  let sequence = 1;
  const ids = () => `018f0000-0000-7000-8000-${String(sequence++).padStart(12, '0')}`;
  return new ConfiguredCheckoutShippingQuoteService(
    repository,
    new ShippingService(configurationRepository, new ManualFlatShippingProvider()),
    new StandardShippingQuoteService(
      repository,
      { state: 'CONFIGURED', amountMinor: 10_000n, currency: 'IRR' },
      () => NOW,
      ids,
    ),
    () => NOW,
    ids,
  );
}

describe('configured checkout shipping quotes', () => {
  it('persists selectable server quotes and revalidates the selected method', async () => {
    const repository = new MemoryQuotes();
    const shipping = service(repository, new MemoryConfiguration(configuration(10_000n)));
    const started = await shipping.selectForCheckout(input());
    expect(started.quote.methodCode).toBe('STANDARD');
    expect(started.options?.map((option) => option.quote.methodCode)).toEqual([
      'STANDARD',
      'EXPRESS',
    ]);
    const express = started.options?.find((option) => option.quote.methodCode === 'EXPRESS');
    if (express === undefined) throw new Error('Missing EXPRESS quote.');
    const selected = await shipping.selectById({ ...input(), quoteId: express.quote.id });
    expect(selected.quote.methodCode).toBe('EXPRESS');
    expect(repository.selectedId).toBe(express.quote.id);
    const confirmed = await shipping.revalidateForConfirmation(input());
    expect(confirmed.state).toBe('CURRENT');
    expect(confirmed.quote.id).toBe(express.quote.id);
    expect(repository.quotes.size).toBe(2);
  });

  it('re-quotes changed server rates and requires customer review', async () => {
    const repository = new MemoryQuotes();
    const source = new MemoryConfiguration(configuration(10_000n));
    const shipping = service(repository, source);
    await shipping.selectForCheckout(input());
    const changed = service(repository, new MemoryConfiguration(configuration(12_000n)));
    const result = await changed.revalidateForConfirmation(input());
    expect(result).toMatchObject({
      state: 'REQUOTED',
      requiresReconfirmation: true,
      quote: { methodCode: 'STANDARD', amountMinor: 12_000n },
    });
  });

  it('rejects a quote from another checkout', async () => {
    const repository = new MemoryQuotes();
    const shipping = service(repository, new MemoryConfiguration(configuration(10_000n)));
    await shipping.selectForCheckout(input());
    await expect(
      shipping.selectById({ ...input(), quoteId: '018f0000-0000-7000-8000-999999999999' }),
    ).rejects.toMatchObject({ code: 'CHECKOUT_SHIPPING_QUOTE_INVALID' });
  });

  it('does not fall back to the legacy rate for an unsupported destination', async () => {
    const repository = new MemoryQuotes();
    const shipping = service(repository, new MemoryConfiguration(configuration(10_000n)));
    await expect(
      shipping.selectForCheckout({
        ...input(),
        destination: { country: 'US', province: 'New York' },
      }),
    ).rejects.toMatchObject({ code: 'SHIPPING_NOT_AVAILABLE' });
    expect(repository.quotes.size).toBe(0);
  });
});
