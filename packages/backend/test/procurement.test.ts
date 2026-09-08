import { describe, expect, it } from 'vitest';

import {
  CLIENT_PO_TRANSITIONS,
  allocateLandedCost,
  deriveLineTotal,
} from '../src/modules/procurement/domain/procurement.js';

describe('purchase-order transitions', () => {
  it('prevents impossible client transitions including derived receipt states', () => {
    expect(CLIENT_PO_TRANSITIONS.RECEIVED).toEqual([]);
    expect(CLIENT_PO_TRANSITIONS.CANCELLED).toEqual([]);
    expect(CLIENT_PO_TRANSITIONS.CONFIRMED).toEqual(['CANCELLED']);
    expect(CLIENT_PO_TRANSITIONS.PARTIALLY_RECEIVED).toEqual([]);
    expect(CLIENT_PO_TRANSITIONS.DRAFT).toContain('SUBMITTED');
    expect(CLIENT_PO_TRANSITIONS.SUBMITTED).toContain('CONFIRMED');
  });
});

describe('landed cost', () => {
  it('derives line totals in integer minor units', () => {
    expect(deriveLineTotal(100n, 3, 25n)).toBe(325n);
  });

  it('allocates extras by line total and puts the remainder on the last id-sorted line', () => {
    const lines = allocateLandedCost(100n, [
      { id: 'b', lineTotalMinor: 30n, quantityOrdered: 1 },
      { id: 'a', lineTotalMinor: 70n, quantityOrdered: 2 },
    ]);
    expect(lines.map((line) => line.purchaseOrderLineId)).toEqual(['a', 'b']);
    expect(lines.reduce((sum, line) => sum + BigInt(line.allocatedExtraMinor), 0n)).toBe(100n);
    expect(lines[0]?.allocatedExtraMinor).toBe('70');
    expect(lines[1]?.allocatedExtraMinor).toBe('30');
  });

  it('preserves an indivisible remainder on the last line', () => {
    const lines = allocateLandedCost(1n, [
      { id: '1', lineTotalMinor: 100n, quantityOrdered: 1 },
      { id: '2', lineTotalMinor: 100n, quantityOrdered: 1 },
    ]);
    expect(lines.map((line) => line.allocatedExtraMinor)).toEqual(['0', '1']);
    expect(lines.reduce((sum, line) => sum + BigInt(line.landedLineMinor), 0n)).toBe(201n);
  });
});
