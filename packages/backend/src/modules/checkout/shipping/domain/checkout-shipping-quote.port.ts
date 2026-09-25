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
  transaction: TransactionContext;
}>;

export type SelectedCheckoutShippingQuote = Readonly<{
  quote: StandardShippingQuote;
  charge: StandardShippingCharge;
}>;

export type RevalidateCheckoutShippingQuoteInput = SelectCheckoutShippingQuoteInput;

export type CheckoutShippingQuoteRevalidation =
  | Readonly<{
      state: 'CURRENT';
      quote: StandardShippingQuote;
      charge: StandardShippingCharge;
    }>
  | Readonly<{
      state: 'REQUOTED';
      quote: StandardShippingQuote;
      previousQuote: StoredShippingQuote | null;
      charge: StandardShippingCharge;
      requiresReconfirmation: boolean;
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
  close(): Promise<void>;
}
