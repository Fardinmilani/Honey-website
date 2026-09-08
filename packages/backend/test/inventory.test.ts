import { describe, expect, it } from 'vitest';

import {
  availabilityBand,
  availableUnits,
  compareInventoryKeys,
} from '../src/modules/inventory/domain/inventory.js';

describe('inventory availability', () => {
  it('classifies zero, one, threshold boundary, and above-threshold units', () => {
    expect(availabilityBand(0, 10)).toBe('OUT_OF_STOCK');
    expect(availabilityBand(-3, 10)).toBe('OUT_OF_STOCK');
    expect(availabilityBand(1, 10)).toBe('LOW_STOCK');
    expect(availabilityBand(10, 10)).toBe('LOW_STOCK');
    expect(availabilityBand(11, 10)).toBe('IN_STOCK');
    expect(availabilityBand(5, 0)).toBe('IN_STOCK');
  });

  it('excludes reserved and allocated units from available-to-sell', () => {
    expect(availableUnits({ onHand: 10, reserved: 3, allocated: 2 })).toBe(5);
  });

  it('orders inventory locks by variant then location', () => {
    const keys = [
      { variantId: 'b', stockLocationId: '2' },
      { variantId: 'a', stockLocationId: '9' },
      { variantId: 'a', stockLocationId: '1' },
    ];
    expect(
      [...keys].sort(compareInventoryKeys).map((key) => `${key.variantId}:${key.stockLocationId}`),
    ).toEqual(['a:1', 'a:9', 'b:2']);
  });
});
