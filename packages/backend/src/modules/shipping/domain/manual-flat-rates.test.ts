import { describe, expect, it } from 'vitest';

import { calculateManualFlatQuotes, resolveShippingZone } from './manual-flat-rates.js';
import type { ShippingConfiguration, ShippingQuoteRequest } from './shipping.js';

const NOW = new Date('2026-10-04T12:00:00.000Z');

function configuration(): ShippingConfiguration {
  return {
    zones: [
      { id: 'fallback', countries: [], provinces: [], priority: 0 },
      { id: 'iran', countries: ['IR'], provinces: [], priority: 0 },
      { id: 'tehran', countries: ['IR'], provinces: ['Tehran'], priority: 0 },
    ],
    methods: [
      {
        code: 'STANDARD',
        zoneId: 'tehran',
        providerCode: 'manual-flat',
        isActive: true,
        sortOrder: 0,
        translations: [
          { locale: 'en', name: 'Standard shipping' },
          { locale: 'fa', name: 'ارسال استاندارد' },
        ],
        rates: [
          {
            id: 'rate',
            currency: 'IRR',
            baseMinor: 10_000n,
            perKgMinor: 2_000n,
            freeOverSubtotalMinor: 100_000n,
            minWeightGrams: 0,
            maxWeightGrams: null,
            validFrom: new Date('2026-01-01T00:00:00.000Z'),
            validTo: null,
          },
        ],
      },
    ],
  };
}

function request(overrides: Partial<ShippingQuoteRequest> = {}): ShippingQuoteRequest {
  return {
    destination: { country: 'IR', province: 'Tehran' },
    currency: 'IRR',
    locale: 'fa',
    merchandiseSubtotalMinor: 50_000n,
    weightGrams: 1_001,
    now: NOW,
    ...overrides,
  };
}

describe('manual-flat shipping rates', () => {
  it('uses the most specific zone and exact localized method', () => {
    const config = configuration();
    expect(resolveShippingZone(config.zones, request().destination).id).toBe('tehran');
    const quotes = calculateManualFlatQuotes(request(), config);
    expect(quotes).toEqual([
      {
        methodCode: 'STANDARD',
        methodName: 'ارسال استاندارد',
        providerCode: 'manual-flat',
        zoneId: 'tehran',
        rateId: 'rate',
        amountMinor: 14_000n,
        currency: 'IRR',
        estimatedDaysMin: 0,
        estimatedDaysMax: 0,
      },
    ]);
  });

  it('uses the configured subtotal threshold, never a client shipping amount', () => {
    const quotes = calculateManualFlatQuotes(
      request({ merchandiseSubtotalMinor: 100_000n }),
      configuration(),
    );
    expect(quotes[0]?.amountMinor).toBe(0n);
  });

  it('fails closed for ambiguous zones and overlapping rates', () => {
    const config = configuration();
    expect(() =>
      resolveShippingZone(
        [
          ...config.zones,
          { id: 'other-tehran', countries: ['IR'], provinces: ['Tehran'], priority: 0 },
        ],
        request().destination,
      ),
    ).toThrow();
    const method = config.methods[0];
    if (method === undefined) throw new Error('Missing test method.');
    expect(() =>
      calculateManualFlatQuotes(request(), {
        ...config,
        methods: [{ ...method, rates: [...method.rates, ...method.rates] }],
      }),
    ).toThrow();
  });

  it('fails closed when no active method covers a destination or rate', () => {
    const config = configuration();
    expect(() =>
      calculateManualFlatQuotes(
        request({ destination: { country: 'US', province: 'NY' } }),
        config,
      ),
    ).toThrow();
    expect(() => calculateManualFlatQuotes(request({ currency: 'USD' }), config)).toThrow();
  });
});
