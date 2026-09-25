import { describe, expect, it } from 'vitest';

import { TransactionContext } from '../../../../platform/domain/transaction.js';
import type {
  CheckoutShippingQuoteRepository,
  SelectCheckoutShippingQuoteInput,
} from '../domain/checkout-shipping-quote.port.js';
import {
  calculateStandardShippingCharge,
  resolveStandardShippingQuoteConfiguration,
  type StandardShippingQuote,
  type StandardShippingQuoteConfiguration,
  type StandardShippingQuoteDraft,
  type StoredShippingQuote,
} from '../domain/standard-shipping-quote.js';
import { StandardShippingQuoteService } from './standard-shipping-quote.service.js';

const CHECKOUT_ID = '018f0000-0000-7000-8000-000000000301';
const ACTOR_ID = '018f0000-0000-7000-8000-000000000302';
const NOW = new Date('2026-09-12T12:00:00.000Z');

class MemoryTransaction extends TransactionContext {}

class MemoryRepository implements CheckoutShippingQuoteRepository {
  readonly created: StandardShippingQuote[] = [];
  readonly selected = new Map<string, StoredShippingQuote>();

  async createAndSelect(quote: StandardShippingQuoteDraft): Promise<StandardShippingQuote> {
    const persisted: StandardShippingQuote = {
      id: quote.id,
      checkoutSessionId: quote.checkoutSessionId,
      methodCode: quote.methodCode,
      amountMinor: quote.amountMinor,
      currency: quote.currency,
      estimatedDaysMin: quote.estimatedDaysMin,
      estimatedDaysMax: quote.estimatedDaysMax,
      expiresAt: quote.expiresAt,
      createdAt: quote.createdAt,
    };
    this.created.push(persisted);
    this.selected.set(persisted.checkoutSessionId, persisted);
    return persisted;
  }

  async lockSelected(checkoutSessionId: string): Promise<StoredShippingQuote | null> {
    return this.selected.get(checkoutSessionId) ?? null;
  }

  async close(): Promise<void> {}
}

function configured(amountMinor = 10_000n): StandardShippingQuoteConfiguration {
  return { state: 'CONFIGURED', amountMinor, currency: 'IRR' };
}

function input(expiresAt: Date, freeShippingApplies = false): SelectCheckoutShippingQuoteInput {
  return {
    checkoutSessionId: CHECKOUT_ID,
    checkoutCurrency: 'IRR',
    expiresAt,
    actorUserId: ACTOR_ID,
    freeShippingApplies,
    transaction: new MemoryTransaction(),
  };
}

function quoteIds(): () => string {
  let sequence = 1;
  return () => `server-quote-${sequence++}`;
}

describe('StandardShippingQuoteService', () => {
  it('creates and selects a server-generated STANDARD quote from configured server money', async () => {
    const repository = new MemoryRepository();
    const service = new StandardShippingQuoteService(
      repository,
      configured(),
      () => new Date(NOW),
      quoteIds(),
    );
    const expiresAt = new Date(NOW.getTime() + 15 * 60 * 1_000);

    const result = await service.selectForCheckout(input(expiresAt));

    expect(result.quote).toMatchObject({
      id: 'server-quote-1',
      checkoutSessionId: CHECKOUT_ID,
      methodCode: 'STANDARD',
      amountMinor: 10_000n,
      currency: 'IRR',
      estimatedDaysMin: 0,
      estimatedDaysMax: 0,
      expiresAt,
    });
    expect(repository.selected.get(CHECKOUT_ID)?.id).toBe('server-quote-1');
    expect(result.charge).toEqual({
      currency: 'IRR',
      quotedAmountMinor: 10_000n,
      discountMinor: 0n,
      totalMinor: 10_000n,
    });
  });

  it('fails closed when the configuration is unavailable or malformed', async () => {
    const expiresAt = new Date(NOW.getTime() + 15 * 60 * 1_000);
    const unavailableRepository = new MemoryRepository();
    const unavailable = new StandardShippingQuoteService(
      unavailableRepository,
      { state: 'UNAVAILABLE' },
      () => new Date(NOW),
    );
    await expect(unavailable.selectForCheckout(input(expiresAt))).rejects.toMatchObject({
      code: 'CHECKOUT_SHIPPING_CONFIGURATION_UNAVAILABLE',
    });
    expect(unavailableRepository.created).toEqual([]);

    const malformed = new StandardShippingQuoteService(
      new MemoryRepository(),
      configured(-1n),
      () => new Date(NOW),
    );
    await expect(malformed.selectForCheckout(input(expiresAt))).rejects.toMatchObject({
      code: 'CHECKOUT_SHIPPING_CONFIGURATION_UNAVAILABLE',
    });
  });

  it('revalidates a selected matching quote without creating another one', async () => {
    const repository = new MemoryRepository();
    const service = new StandardShippingQuoteService(
      repository,
      configured(),
      () => new Date(NOW),
      quoteIds(),
    );
    const expiresAt = new Date(NOW.getTime() + 15 * 60 * 1_000);
    await service.selectForCheckout(input(expiresAt));

    const result = await service.revalidateForConfirmation(input(expiresAt));

    expect(result.state).toBe('CURRENT');
    expect(repository.created).toHaveLength(1);
    expect(result.charge.totalMinor).toBe(10_000n);
  });

  it('re-quotes a selected quote that no longer matches current server configuration', async () => {
    const repository = new MemoryRepository();
    const expiresAt = new Date(NOW.getTime() + 15 * 60 * 1_000);
    const ids = quoteIds();
    const initial = new StandardShippingQuoteService(
      repository,
      configured(10_000n),
      () => new Date(NOW),
      ids,
    );
    await initial.selectForCheckout(input(expiresAt));
    const changed = new StandardShippingQuoteService(
      repository,
      configured(12_000n),
      () => new Date(NOW),
      ids,
    );

    const result = await changed.revalidateForConfirmation(input(expiresAt));

    expect(result).toMatchObject({
      state: 'REQUOTED',
      requiresReconfirmation: true,
      previousQuote: { id: 'server-quote-1', amountMinor: 10_000n },
      quote: { id: 'server-quote-2', amountMinor: 12_000n },
    });
    expect(result.charge.totalMinor).toBe(12_000n);
  });

  it('re-quotes an expired selection and reports that an unchanged rate needs no money reconfirmation', async () => {
    const repository = new MemoryRepository();
    const firstExpiry = new Date(NOW.getTime() + 60_000);
    const ids = quoteIds();
    const initial = new StandardShippingQuoteService(
      repository,
      configured(),
      () => new Date(NOW),
      ids,
    );
    await initial.selectForCheckout(input(firstExpiry));
    const afterExpiry = new Date(NOW.getTime() + 120_000);
    const extendedExpiry = new Date(NOW.getTime() + 30 * 60 * 1_000);
    const revalidator = new StandardShippingQuoteService(
      repository,
      configured(),
      () => new Date(afterExpiry),
      ids,
    );

    const result = await revalidator.revalidateForConfirmation(input(extendedExpiry));

    expect(result).toMatchObject({
      state: 'REQUOTED',
      requiresReconfirmation: false,
      previousQuote: { id: 'server-quote-1' },
      quote: { id: 'server-quote-2' },
    });
    expect(repository.created).toHaveLength(2);
  });

  it('uses only a server-derived free-shipping outcome and never makes the total negative', async () => {
    const repository = new MemoryRepository();
    const service = new StandardShippingQuoteService(
      repository,
      configured(7n),
      () => new Date(NOW),
      quoteIds(),
    );
    const expiresAt = new Date(NOW.getTime() + 15 * 60 * 1_000);

    const result = await service.selectForCheckout(input(expiresAt, true));

    expect(result.charge).toEqual({
      currency: 'IRR',
      quotedAmountMinor: 7n,
      discountMinor: 7n,
      totalMinor: 0n,
    });
    expect(() =>
      calculateStandardShippingCharge(
        { amountMinor: 7n, currency: 'IRR', methodCode: 'STANDARD' },
        false,
      ),
    ).not.toThrow();
  });
});

describe('resolveStandardShippingQuoteConfiguration', () => {
  it('does not reinterpret missing or invalid configuration as a zero-value rate', () => {
    expect(
      resolveStandardShippingQuoteConfiguration({ amountMinor: undefined, currency: undefined }),
    ).toEqual({
      state: 'UNAVAILABLE',
    });
    expect(
      resolveStandardShippingQuoteConfiguration({ amountMinor: '-1', currency: 'IRR' }),
    ).toEqual({
      state: 'UNAVAILABLE',
    });
    expect(
      resolveStandardShippingQuoteConfiguration({ amountMinor: '0', currency: 'IRR' }),
    ).toEqual({
      state: 'CONFIGURED',
      amountMinor: 0n,
      currency: 'IRR',
    });
  });
});
