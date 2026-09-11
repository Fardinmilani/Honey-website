import { describe, expect, it } from 'vitest';

import { addMoney, createMoney, deserializeMoney, serializeMoney } from './money.js';
import {
  allocateProportionalDiscount,
  calculateCouponEffect,
  calculateTax,
  divideRoundHalfUp,
  evaluateCoupon,
  resolveCurrentPrice,
  resolveTaxRate,
  type CouponRecord,
  type DiscountAllocationLine,
  type TaxRateRecord,
  type VariantPriceRecord,
} from './pricing.js';

function date(value: string): Date {
  return new Date(value);
}

function price(input: Partial<VariantPriceRecord> = {}): VariantPriceRecord {
  return {
    id: 'price-a',
    variantId: 'variant-a',
    currency: 'IRR',
    amountMinor: 100n,
    compareAtMinor: null,
    validFrom: date('2026-01-01T00:00:00.000Z'),
    validTo: null,
    ...input,
  };
}

function coupon(input: Partial<CouponRecord> = {}): CouponRecord {
  return {
    id: 'coupon-a',
    code: 'HARVEST-10',
    type: 'PERCENT',
    value: 1_000n,
    currency: null,
    minSubtotalMinor: null,
    maxDiscountMinor: null,
    startsAt: date('2026-01-01T00:00:00.000Z'),
    endsAt: null,
    usageLimitTotal: null,
    usageLimitPerUser: null,
    usedCount: 0,
    appliesTo: 'ALL',
    targetIds: [],
    status: 'ACTIVE',
    ...input,
  };
}

function taxRate(input: Partial<TaxRateRecord> = {}): TaxRateRecord {
  return {
    id: 'tax-a',
    code: 'IR-DEFAULT',
    rateBps: 900,
    country: 'IR',
    region: null,
    isInclusive: false,
    isActive: true,
    ...input,
  };
}

function sumMinor(values: readonly bigint[]): bigint {
  return values.reduce((total, value) => total + value, 0n);
}

function eligibleSubtotal(lines: readonly DiscountAllocationLine[]): bigint {
  return sumMinor(lines.filter((line) => line.eligible).map((line) => line.subtotalMinor));
}

function assertExactAllocation(
  lines: readonly DiscountAllocationLine[],
  discountMinor: bigint,
): void {
  const allocation = allocateProportionalDiscount(lines, discountMinor);
  const allocatedMinor = sumMinor(allocation.lines.map((line) => line.discountMinor));
  const originalSubtotalMinor = sumMinor(lines.map((line) => line.subtotalMinor));
  const finalTotalMinor = sumMinor(allocation.lines.map((line) => line.finalTotalMinor));

  expect(allocation.discountMinor).toBe(discountMinor);
  expect(allocatedMinor).toBe(discountMinor);
  expect(finalTotalMinor).toBe(originalSubtotalMinor - discountMinor);
  expect(allocation.finalMerchandiseTotalMinor).toBe(finalTotalMinor);
  expect(allocation.lines.every((line) => line.discountMinor <= line.subtotalMinor)).toBe(true);
  expect(allocation.lines.every((line) => line.finalTotalMinor >= 0n)).toBe(true);
  expect(
    allocation.lines
      .filter((line) => !lines.find((candidate) => candidate.id === line.id)?.eligible)
      .every((line) => line.discountMinor === 0n),
  ).toBe(true);
  expect(allocateProportionalDiscount([...lines].reverse(), discountMinor)).toEqual(allocation);
}

function deterministicLines(lineCount: number, seed: bigint): readonly DiscountAllocationLine[] {
  let state = seed;
  const lines: DiscountAllocationLine[] = [];

  for (let index = 0; index < lineCount; index += 1) {
    state = (state * 48_271n + 1n) % 2_147_483_647n;
    lines.push({
      id: `line-${String(lineCount - index).padStart(4, '0')}`,
      subtotalMinor: (state % 100_003n) + 1n,
      eligible: index % 5 !== 0,
    });
  }

  return lines;
}

describe('pricing money', () => {
  it('serializes arbitrary bigint minor-unit money without a number conversion', () => {
    const value = createMoney(9_007_199_254_740_993_123n, 'irr');

    expect(serializeMoney(value)).toEqual({
      amountMinor: '9007199254740993123',
      currency: 'IRR',
    });
    expect(deserializeMoney({ amountMinor: '9007199254740993123', currency: 'IRR' })).toEqual(
      value,
    );
    expect(addMoney(value, createMoney(7n, 'IRR')).amountMinor).toBe(9_007_199_254_740_993_130n);
  });

  it('rejects negative and unsafe serialized amounts', () => {
    expect(() => createMoney(-1n, 'IRR')).toThrow('must not be negative');
    expect(() => deserializeMoney({ amountMinor: '-1', currency: 'IRR' })).toThrow(
      'non-negative integer string',
    );
  });
});

describe('current price resolution', () => {
  it('selects the latest active price and respects validity boundaries', () => {
    const now = date('2026-06-01T12:00:00.000Z');
    const resolved = resolveCurrentPrice({
      prices: [
        price({
          id: 'expired',
          amountMinor: 75n,
          validFrom: date('2026-01-01T00:00:00.000Z'),
          validTo: now,
        }),
        price({
          id: 'active-old',
          amountMinor: 100n,
          validFrom: date('2026-02-01T00:00:00.000Z'),
        }),
        price({
          id: 'active-replacement',
          amountMinor: 110n,
          validFrom: date('2026-05-01T00:00:00.000Z'),
        }),
        price({
          id: 'future',
          amountMinor: 120n,
          validFrom: date('2026-07-01T00:00:00.000Z'),
        }),
      ],
      variantId: 'variant-a',
      currency: 'IRR',
      now,
      variantExists: true,
      enabledCurrencies: ['IRR'],
    });

    expect(resolved?.id).toBe('active-replacement');
    expect(
      resolveCurrentPrice({
        prices: [price({ id: 'future', validFrom: date('2026-07-01T00:00:00.000Z') })],
        variantId: 'variant-a',
        currency: 'IRR',
        now,
        variantExists: true,
        enabledCurrencies: ['IRR'],
      }),
    ).toBeNull();
  });

  it('rejects unsupported currencies and malformed price windows', () => {
    expect(() =>
      resolveCurrentPrice({
        prices: [],
        variantId: 'variant-a',
        currency: 'USD',
        now: date('2026-06-01T12:00:00.000Z'),
        variantExists: true,
        enabledCurrencies: ['IRR'],
      }),
    ).toThrow('not enabled');
    expect(() =>
      resolveCurrentPrice({
        prices: [
          price({
            validTo: date('2026-01-01T00:00:00.000Z'),
            validFrom: date('2026-01-01T00:00:00.000Z'),
          }),
        ],
        variantId: 'variant-a',
        currency: 'IRR',
        now: date('2026-06-01T12:00:00.000Z'),
        variantExists: true,
        enabledCurrencies: ['IRR'],
      }),
    ).toThrow('after its validity start');
  });
});

describe('coupon evaluation', () => {
  it('applies exact percentage discounts only to eligible target lines and honors caps', () => {
    const result = evaluateCoupon({
      coupon: coupon({
        value: 5_000n,
        maxDiscountMinor: 30n,
        appliesTo: 'CATEGORY',
        targetIds: ['flower'],
      }),
      currency: 'IRR',
      now: date('2026-06-01T12:00:00.000Z'),
      cartSubtotalMinor: 160n,
      customerRedemptionCount: 0,
      lines: [
        {
          id: 'line-ineligible',
          variantId: 'variant-b',
          categoryIds: ['other'],
          collectionIds: [],
          subtotalMinor: 60n,
        },
        {
          id: 'line-eligible',
          variantId: 'variant-a',
          categoryIds: ['flower'],
          collectionIds: [],
          subtotalMinor: 100n,
        },
      ],
    });

    expect(result).toEqual({
      eligible: true,
      reason: null,
      eligibleLineIds: ['line-eligible'],
      perUserLimitDeferred: false,
      effect: { type: 'PERCENT', discountMinor: 30n, shippingEffect: 'NONE' },
    });
  });

  it('defers only unenforceable per-user limits and never invents free-shipping value', () => {
    const freeShipping = evaluateCoupon({
      coupon: coupon({ type: 'FREE_SHIPPING', value: 0n, usageLimitPerUser: 1 }),
      currency: 'IRR',
      now: date('2026-06-01T12:00:00.000Z'),
      cartSubtotalMinor: 100n,
      customerRedemptionCount: null,
      lines: [
        {
          id: 'line-a',
          variantId: 'variant-a',
          categoryIds: [],
          collectionIds: [],
          subtotalMinor: 100n,
        },
      ],
    });
    const overLimit = evaluateCoupon({
      coupon: coupon({ type: 'FIXED', value: 25n, currency: 'IRR', usageLimitPerUser: 1 }),
      currency: 'IRR',
      now: date('2026-06-01T12:00:00.000Z'),
      cartSubtotalMinor: 100n,
      customerRedemptionCount: 1,
      lines: [
        {
          id: 'line-a',
          variantId: 'variant-a',
          categoryIds: [],
          collectionIds: [],
          subtotalMinor: 100n,
        },
      ],
    });

    expect(freeShipping).toMatchObject({
      eligible: true,
      perUserLimitDeferred: true,
      effect: { discountMinor: 0n, shippingEffect: 'DEFERRED' },
    });
    expect(overLimit).toMatchObject({
      eligible: false,
      reason: 'COUPON_PER_USER_LIMIT_REACHED',
    });
  });

  it('rejects expired, currency-mismatched, and minimum-subtotal coupons', () => {
    const base = {
      currency: 'IRR',
      now: date('2026-06-01T12:00:00.000Z'),
      customerRedemptionCount: 0,
      lines: [
        {
          id: 'line-a',
          variantId: 'variant-a',
          categoryIds: [],
          collectionIds: [],
          subtotalMinor: 100n,
        },
      ],
    };

    expect(
      evaluateCoupon({
        ...base,
        coupon: coupon({ endsAt: date('2026-06-01T12:00:00.000Z') }),
        cartSubtotalMinor: 100n,
      }).reason,
    ).toBe('COUPON_EXPIRED');
    expect(
      evaluateCoupon({
        ...base,
        coupon: coupon({ type: 'FIXED', value: 25n, currency: 'USD' }),
        cartSubtotalMinor: 100n,
      }).reason,
    ).toBe('COUPON_CURRENCY_MISMATCH');
    expect(
      evaluateCoupon({
        ...base,
        coupon: coupon({ minSubtotalMinor: 101n }),
        cartSubtotalMinor: 100n,
      }).reason,
    ).toBe('COUPON_MINIMUM_SUBTOTAL_NOT_MET');
  });
});

describe('discount allocation', () => {
  it('preserves the exact discount and gives remainder to stable line ids', () => {
    const result = allocateProportionalDiscount(
      [
        { id: 'line-b', subtotalMinor: 100n, eligible: true },
        { id: 'line-c', subtotalMinor: 100n, eligible: false },
        { id: 'line-a', subtotalMinor: 100n, eligible: true },
      ],
      1n,
    );

    expect(result.lines).toEqual([
      { id: 'line-a', subtotalMinor: 100n, discountMinor: 1n, finalTotalMinor: 99n },
      { id: 'line-b', subtotalMinor: 100n, discountMinor: 0n, finalTotalMinor: 100n },
      { id: 'line-c', subtotalMinor: 100n, discountMinor: 0n, finalTotalMinor: 100n },
    ]);
    expect(result.discountMinor).toBe(1n);
    expect(result.finalMerchandiseTotalMinor).toBe(299n);
  });

  it('handles large bigint values without drift or negative line totals', () => {
    const huge = 9_007_199_254_740_993_123n;
    const result = allocateProportionalDiscount(
      [
        { id: 'a', subtotalMinor: huge, eligible: true },
        { id: 'b', subtotalMinor: huge, eligible: true },
      ],
      huge,
    );

    const allocated = result.lines.reduce((total, line) => total + line.discountMinor, 0n);
    const final = result.lines.reduce((total, line) => total + line.finalTotalMinor, 0n);
    expect(allocated).toBe(huge);
    expect(final).toBe(result.finalMerchandiseTotalMinor);
    expect(result.lines.every((line) => line.finalTotalMinor >= 0n)).toBe(true);
  });

  it('preserves exact totals across deterministic generated allocation cases', () => {
    const oneMinor = [
      { id: 'line-c', subtotalMinor: 1n, eligible: true },
      { id: 'line-a', subtotalMinor: 1n, eligible: true },
      { id: 'line-b', subtotalMinor: 1n, eligible: false },
    ] as const;
    const manyLines = deterministicLines(257, 91_827_364n);
    const huge = 9_007_199_254_740_993_123_456_789_012_345_678_901n;
    const hugeLines = [
      { id: 'line-z', subtotalMinor: huge, eligible: true },
      { id: 'line-a', subtotalMinor: huge - 1n, eligible: true },
      { id: 'line-m', subtotalMinor: huge - 2n, eligible: true },
      { id: 'line-ineligible', subtotalMinor: huge * 2n, eligible: false },
    ] as const;

    assertExactAllocation(oneMinor, 1n);
    assertExactAllocation(manyLines, eligibleSubtotal(manyLines) - 1n);
    assertExactAllocation(hugeLines, huge * 2n + 1n);
  });

  it('keeps awkward percentage remainders and maximum-discount edges exact', () => {
    const awkwardLines = [
      { id: 'line-07', subtotalMinor: 1n, eligible: true },
      { id: 'line-06', subtotalMinor: 2n, eligible: true },
      { id: 'line-05', subtotalMinor: 3n, eligible: true },
      { id: 'line-04', subtotalMinor: 5n, eligible: true },
      { id: 'line-03', subtotalMinor: 8n, eligible: true },
      { id: 'line-02', subtotalMinor: 13n, eligible: true },
      { id: 'line-01', subtotalMinor: 21n, eligible: true },
      { id: 'line-ineligible', subtotalMinor: 34n, eligible: false },
    ] as const;
    const subtotalMinor = eligibleSubtotal(awkwardLines);
    const percentageCoupon = coupon({ value: 3_333n, maxDiscountMinor: null });
    const percentageEffect = calculateCouponEffect({
      coupon: percentageCoupon,
      currency: 'IRR',
      eligibleSubtotalMinor: subtotalMinor,
    });

    expect(subtotalMinor).toBe(53n);
    expect(percentageEffect.discountMinor).toBe(18n);
    assertExactAllocation(awkwardLines, percentageEffect.discountMinor);

    const capLines = [
      { id: 'line-c', subtotalMinor: 21n, eligible: true },
      { id: 'line-a', subtotalMinor: 34n, eligible: true },
      { id: 'line-b', subtotalMinor: 55n, eligible: true },
    ] as const;
    const capSubtotalMinor = eligibleSubtotal(capLines);
    const expectedDiscounts = [0n, 95n, 96n, 96n] as const;
    const caps = [0n, 95n, 96n, 500n] as const;

    expect(capSubtotalMinor).toBe(110n);
    for (const [index, cap] of caps.entries()) {
      const effect = calculateCouponEffect({
        coupon: coupon({ value: 8_750n, maxDiscountMinor: cap }),
        currency: 'IRR',
        eligibleSubtotalMinor: capSubtotalMinor,
      });
      const expectedDiscount = expectedDiscounts[index];
      if (expectedDiscount === undefined) throw new Error('Missing expected discount fixture.');

      expect(effect.discountMinor).toBe(expectedDiscount);
      assertExactAllocation(capLines, effect.discountMinor);
    }
  });
});

describe('tax calculation', () => {
  it('uses active regional rules before country rules and ignores inactive rules', () => {
    const rate = resolveTaxRate({
      rates: [
        taxRate({ id: 'country', code: 'IR-DEFAULT', region: null }),
        taxRate({ id: 'inactive-region', code: 'IR-TEH-INACTIVE', region: 'TEH', isActive: false }),
        taxRate({ id: 'region', code: 'IR-TEH', region: 'TEH', rateBps: 1_000 }),
      ],
      jurisdiction: { country: 'ir', region: 'teh' },
    });

    expect(rate?.id).toBe('region');
  });

  it('calculates inclusive, exclusive, zero-rate, unresolved, and half-up tax exactly', () => {
    const exclusive = calculateTax({ taxableAmountMinor: 5n, rate: taxRate({ rateBps: 1_000 }) });
    const inclusive = calculateTax({
      taxableAmountMinor: 109n,
      rate: taxRate({ rateBps: 900, isInclusive: true }),
    });
    const zero = calculateTax({ taxableAmountMinor: 100n, rate: taxRate({ rateBps: 0 }) });
    const unresolved = calculateTax({ taxableAmountMinor: 100n, rate: null });

    expect(divideRoundHalfUp(5n, 10n)).toBe(1n);
    expect(exclusive).toMatchObject({
      state: 'RESOLVED',
      taxAmountMinor: 1n,
      totalAmountMinor: 6n,
    });
    expect(inclusive).toMatchObject({
      state: 'RESOLVED',
      netAmountMinor: 100n,
      taxAmountMinor: 9n,
      totalAmountMinor: 109n,
    });
    expect(zero).toMatchObject({ state: 'RESOLVED', taxAmountMinor: 0n, totalAmountMinor: 100n });
    expect(unresolved).toEqual({
      state: 'UNRESOLVED',
      rate: null,
      taxableAmountMinor: 100n,
      netAmountMinor: null,
      taxAmountMinor: null,
      totalAmountMinor: null,
    });
  });
});
