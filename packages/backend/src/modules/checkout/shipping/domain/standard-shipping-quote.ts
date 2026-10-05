import { assertNonNegativeMinor, normalizeCurrency } from '../../../pricing/index.js';

export const STANDARD_SHIPPING_METHOD_CODE = 'STANDARD';
export const STANDARD_SHIPPING_ESTIMATED_DAYS_MIN = 0;
export const STANDARD_SHIPPING_ESTIMATED_DAYS_MAX = 0;

const MAX_POSTGRES_BIGINT = 9_223_372_036_854_775_807n;
const MINOR_AMOUNT = /^(?:0|[1-9][0-9]*)$/u;

export type StandardShippingQuoteConfiguration =
  | Readonly<{
      state: 'CONFIGURED';
      amountMinor: bigint;
      currency: string;
    }>
  | Readonly<{
      state: 'UNAVAILABLE';
    }>;

export type StandardShippingQuoteConfigurationInput = Readonly<{
  amountMinor: string | undefined;
  currency: string | undefined;
}>;

export type StoredShippingQuote = Readonly<{
  id: string;
  checkoutSessionId: string;
  methodCode: string;
  amountMinor: bigint;
  currency: string;
  estimatedDaysMin: number;
  estimatedDaysMax: number;
  expiresAt: Date;
  createdAt: Date;
  contextFingerprint?: string | null;
  methodName?: string | null;
  providerCode?: string | null;
}>;

export type StandardShippingQuote = Readonly<{
  id: string;
  checkoutSessionId: string;
  methodCode: string;
  amountMinor: bigint;
  currency: string;
  estimatedDaysMin: number;
  estimatedDaysMax: number;
  expiresAt: Date;
  createdAt: Date;
}>;

export type StandardShippingQuoteDraft = StandardShippingQuote &
  Readonly<{
    actorUserId: string | null;
    contextFingerprint?: string;
    methodName?: string;
    providerCode?: string;
  }>;

export type StandardShippingCharge = Readonly<{
  currency: string;
  quotedAmountMinor: bigint;
  discountMinor: bigint;
  totalMinor: bigint;
}>;

/**
 * Converts explicit server configuration into a usable quote rate. A missing
 * or malformed pair deliberately has no implicit zero-value fallback.
 */
export function resolveStandardShippingQuoteConfiguration(
  input: StandardShippingQuoteConfigurationInput,
): StandardShippingQuoteConfiguration {
  if (input.amountMinor === undefined || input.currency === undefined) {
    return { state: 'UNAVAILABLE' };
  }
  if (!MINOR_AMOUNT.test(input.amountMinor)) return { state: 'UNAVAILABLE' };

  const amountMinor = BigInt(input.amountMinor);
  if (amountMinor > MAX_POSTGRES_BIGINT) return { state: 'UNAVAILABLE' };

  try {
    return {
      state: 'CONFIGURED',
      amountMinor: assertNonNegativeMinor(amountMinor, 'standard shipping amount'),
      currency: normalizeCurrency(input.currency),
    };
  } catch {
    return { state: 'UNAVAILABLE' };
  }
}

export function isConfiguredStandardShippingQuote(
  value: StandardShippingQuoteConfiguration,
): value is Extract<StandardShippingQuoteConfiguration, Readonly<{ state: 'CONFIGURED' }>> {
  return value.state === 'CONFIGURED';
}

/**
 * This seam accepts only the server-derived free-shipping result. It never
 * accepts a client-supplied shipping discount or total.
 */
export function calculateStandardShippingCharge(
  quote: Pick<StandardShippingQuote, 'amountMinor' | 'currency' | 'methodCode'>,
  freeShippingApplies: boolean,
): StandardShippingCharge {
  if (typeof freeShippingApplies !== 'boolean') {
    throw new TypeError('freeShippingApplies must be a server-derived boolean.');
  }
  const quotedAmountMinor = assertNonNegativeMinor(quote.amountMinor, 'shipping quote amount');
  const currency = normalizeCurrency(quote.currency);
  const discountMinor = freeShippingApplies ? quotedAmountMinor : 0n;
  return {
    currency,
    quotedAmountMinor,
    discountMinor,
    totalMinor: quotedAmountMinor - discountMinor,
  };
}
