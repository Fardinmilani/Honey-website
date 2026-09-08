import { describe, expect, it } from 'vitest';

import { assertSourcingShape } from '../src/modules/sourcing/domain/sourcing.js';

describe('sourcing shape', () => {
  it('accepts own-production with an apiary and no supplier', () => {
    expect(() =>
      assertSourcingShape({
        batchCode: 'OWN-1',
        sourcingType: 'OWN_PRODUCTION',
        apiaryId: '018f0000-0000-7000-8000-000000000020',
        harvestSeason: 'spring',
        harvestYear: 2026,
        floralSources: ['wildflower'],
        quantityGrams: 1,
      }),
    ).not.toThrow();
  });

  it('rejects own-production with a supplier and selected-supplier without a supplier', () => {
    expect(() =>
      assertSourcingShape({
        batchCode: 'BAD',
        sourcingType: 'OWN_PRODUCTION',
        apiaryId: '018f0000-0000-7000-8000-000000000020',
        supplierId: '018f0000-0000-7000-8000-000000000023',
        harvestSeason: 'spring',
        harvestYear: 2026,
        floralSources: ['wildflower'],
        quantityGrams: 1,
      }),
    ).toThrow(/INVALID_SOURCING_SHAPE/u);
    expect(() =>
      assertSourcingShape({
        batchCode: 'BAD-SUP',
        sourcingType: 'SELECTED_SUPPLIER',
        harvestSeason: 'summer',
        harvestYear: 2026,
        floralSources: ['thyme'],
        quantityGrams: 1,
      }),
    ).toThrow(/INVALID_SOURCING_SHAPE/u);
  });
});
