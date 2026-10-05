import type { TransactionContext } from '../../../../platform/domain/transaction.js';

import type {
  StandardShippingCharge,
  StandardShippingQuote,
  StandardShippingQuoteDraft,
  StoredShippingQuote,
} from './standard-shipping-quote.js';

export type SelectCheckoutShippingQuoteInput = Readonly<{
  checkoutSessionId: string;
  checkoutCurrency: string;
  /** The checkout's server-derived reservation expiry, never browser input. */
  expiresAt: Date;
  actorUserId: string | null;
  /** Derived only after server-side coupon revalidation. */
  freeShippingApplies: boolean;
  destination?: Readonly<{ country: string; province: string }>;
  locale?: string;
  merchandiseSubtotalMinor?: bigint;
  weightGrams?: number;
  transaction: TransactionContext;
}>;

export type CheckoutShippingOption = Readonly<{
  quote: StandardShippingQuote;
  name: string;
  providerCode: string;
  charge: StandardShippingCharge;
}>;

export type SelectedCheckoutShippingQuote = Readonly<{
  quote: StandardShippingQuote;
  charge: StandardShippingCharge;
  options?: readonly CheckoutShippingOption[];
  name?: string;
  providerCode?: string;
}>;

export type RevalidateCheckoutShippingQuoteInput = SelectCheckoutShippingQuoteInput;

export type CheckoutShippingQuoteRevalidation =
  | Readonly<{
      state: 'CURRENT';
      quote: StandardShippingQuote;
      charge: StandardShippingCharge;
      options?: readonly CheckoutShippingOption[];
      name?: string;
      providerCode?: string;
    }>
  | Readonly<{
      state: 'REQUOTED';
      quote: StandardShippingQuote;
      previousQuote: StoredShippingQuote | null;
      charge: StandardShippingCharge;
      requiresReconfirmation: boolean;
      options?: readonly CheckoutShippingOption[];
      name?: string;
      providerCode?: string;
    }>;

/**
 * Checkout depends on this narrow port rather than a Phase 15 shipping
 * provider. A later adapter can preserve these selection/revalidation calls.
 */
export interface CheckoutShippingQuotePort {
  selectForCheckout(
    input: SelectCheckoutShippingQuoteInput,
  ): Promise<SelectedCheckoutShippingQuote>;
  revalidateForConfirmation(
    input: RevalidateCheckoutShippingQuoteInput,
  ): Promise<CheckoutShippingQuoteRevalidation>;
  selectById?(
    input: SelectCheckoutShippingQuoteInput & Readonly<{ quoteId: string }>,
  ): Promise<SelectedCheckoutShippingQuote>;
}

export interface CheckoutShippingQuoteRepository {
  createAndSelect(
    quote: StandardShippingQuoteDraft,
    transaction: TransactionContext,
  ): Promise<StandardShippingQuote>;
  lockSelected(
    checkoutSessionId: string,
    transaction: TransactionContext,
  ): Promise<StoredShippingQuote | null>;
  createOptionsAndSelect?(
    quotes: readonly StandardShippingQuoteDraft[],
    selectedQuoteId: string,
    transaction: TransactionContext,
  ): Promise<readonly StoredShippingQuote[]>;
  findForCheckout?(
    checkoutSessionId: string,
    quoteId: string,
    transaction: TransactionContext,
  ): Promise<StoredShippingQuote | null>;
  listCurrentForCheckout?(
    checkoutSessionId: string,
    contextFingerprint: string,
    now: Date,
    transaction: TransactionContext,
  ): Promise<readonly StoredShippingQuote[]>;
  selectExisting?(
    checkoutSessionId: string,
    quoteId: string,
    actorUserId: string | null,
    transaction: TransactionContext,
  ): Promise<void>;
  close(): Promise<void>;
}
