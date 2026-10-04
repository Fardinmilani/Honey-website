import { describe, expect, it } from 'vitest';

import { decideTransition } from './payments.js';

describe('decideTransition', () => {
  it('applies CREATED to PENDING and AUTHORIZED, but not backward', () => {
    expect(decideTransition('CREATED', 'PENDING')).toBe('APPLY');
    expect(decideTransition('PENDING', 'AUTHORIZED')).toBe('APPLY');
    expect(decideTransition('AUTHORIZED', 'PENDING')).toBe('NOOP');
    expect(decideTransition('PENDING', 'PENDING')).toBe('NOOP');
  });

  it('applies terminal outcomes from non-terminal states', () => {
    expect(decideTransition('PENDING', 'PAID')).toBe('APPLY');
    expect(decideTransition('PENDING', 'FAILED')).toBe('APPLY');
    expect(decideTransition('PENDING', 'CANCELLED')).toBe('APPLY');
    expect(decideTransition('PENDING', 'EXPIRED')).toBe('APPLY');
  });

  it('never walks PAID back', () => {
    expect(decideTransition('PAID', 'PAID')).toBe('NOOP');
    expect(decideTransition('PAID', 'PENDING')).toBe('NOOP');
    expect(decideTransition('PAID', 'FAILED')).toBe('NOOP');
    expect(decideTransition('PAID', 'CANCELLED')).toBe('NOOP');
    expect(decideTransition('PAID', 'EXPIRED')).toBe('NOOP');
  });

  it('allows a late PAID to recover a negative terminal, and never overwrites refunds', () => {
    expect(decideTransition('FAILED', 'PAID')).toBe('APPLY');
    expect(decideTransition('CANCELLED', 'FAILED')).toBe('NOOP');
    expect(decideTransition('REFUNDED', 'PAID')).toBe('NOOP');
    expect(decideTransition('PARTIALLY_REFUNDED', 'FAILED')).toBe('NOOP');
  });
});
