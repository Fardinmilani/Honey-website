import type { TransactionContext } from '../../../platform/domain/transaction.js';
import type {
  CouponRecord,
  CouponEvaluation,
  DiscountAllocationLine,
  DiscountAllocationResult,
  CouponLine,
  TaxCalculation,
  VariantPriceRecord,
} from '../../pricing/index.js';

export const CART_STATUSES = ['ACTIVE', 'MERGED', 'CONVERTED', 'ABANDONED'] as const;
export type CartStatus = (typeof CART_STATUSES)[number];

export type CartOwner =
  | Readonly<{ userId: string; anonymousId?: never }>
  | Readonly<{ userId?: never; anonymousId: string }>;

export type CartConfig = Readonly<{
  activeTtlMs: number;
  maximumLineQuantity: number;
  defaultCurrency: string;
  enabledCurrencies: readonly string[];
}>;

export type CartRecord = Readonly<{
  id: string;
  userId: string | null;
  anonymousId: string | null;
  currency: string;
  locale: string;
  status: CartStatus;
  couponCode: string | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}>;

export type CartProductSummary = Readonly<{
  productId: string;
  productName: string;
  productSlug: string;
  variantName: string;
  netWeightGrams: number;
  /** Internal ordered candidates; cart resolves them through the media module. */
  imageAssetIds?: readonly string[];
  imageUrl: string | null;
  categoryIds: readonly string[];
  collectionIds: readonly string[];
  published: boolean;
}>;

export type CartLineRecord = Readonly<{
  id: string;
  cartId: string;
  variantId: string;
  quantity: number;
  addedAt: Date;
  product: CartProductSummary;
}>;

export type CartAvailability = Readonly<{
  variantId: string;
  availableToSell: number;
  band: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
}>;

export interface CartAvailabilityPort {
  availabilityForVariants(variantIds: readonly string[]): Promise<readonly CartAvailability[]>;
}

export type CartCouponEvaluation = Readonly<{
  coupon: CouponRecord | null;
  couponEvaluation: CouponEvaluation | null;
}>;

export interface CartPricingPort {
  resolvePrices(
    variantIds: readonly string[],
    currency: string,
    now: Date,
  ): Promise<ReadonlyMap<string, VariantPriceRecord>>;
  evaluateCoupon(
    code: string,
    currency: string,
    now: Date,
    cartSubtotalMinor: bigint,
    lines: readonly CouponLine[],
    userId: string | null,
  ): Promise<CartCouponEvaluation>;
  allocateDiscount(
    lines: readonly DiscountAllocationLine[],
    discountMinor: bigint,
  ): DiscountAllocationResult;
  unresolvedTax(taxableAmountMinor: bigint): TaxCalculation;
}

export type CartLineState = 'PURCHASABLE' | 'OUT_OF_STOCK' | 'UNPUBLISHED' | 'PRICE_UNAVAILABLE';

export type CartAdjustment = Readonly<{
  code: 'QUANTITY_CLAMPED';
  lineId: string;
}>;

export type CartViewLine = Readonly<{
  id: string;
  variantId: string;
  product: Readonly<{
    id: string;
    name: string;
    slug: string;
    imageUrl: string | null;
  }>;
  variant: Readonly<{
    name: string;
    netWeightGrams: number;
  }>;
  quantity: number;
  availabilityBand: CartAvailability['band'];
  state: CartLineState;
  unitPrice: Readonly<{ amountMinor: string; currency: string }> | null;
  lineSubtotal: Readonly<{ amountMinor: string; currency: string }>;
  discount: Readonly<{ amountMinor: string; currency: string }>;
  lineTotal: Readonly<{ amountMinor: string; currency: string }>;
}>;

export type CartView = Readonly<{
  id: string;
  locale: string;
  currency: string;
  expiresAt: string;
  lines: readonly CartViewLine[];
  coupon: null | Readonly<{
    code: string;
    state: 'APPLIED' | 'INELIGIBLE' | 'DEFERRED';
    reason: string | null;
  }>;
  subtotal: Readonly<{ amountMinor: string; currency: string }>;
  discountTotal: Readonly<{ amountMinor: string; currency: string }>;
  tax: Readonly<{
    state: 'UNRESOLVED' | 'RESOLVED';
    amount: Readonly<{ amountMinor: string; currency: string }> | null;
  }>;
  merchandiseTotal: Readonly<{ amountMinor: string; currency: string }>;
  adjustments: readonly CartAdjustment[];
}>;

export type CartAddIdempotencyLookup = Readonly<{
  key: string;
  scope: string;
  userId: string | null;
  requestHash: string;
}>;

export type CartAddIdempotencyClaim = Readonly<{
  requestHash: string;
  completed: boolean;
}>;

export interface CartRepository {
  runInTransaction<Result>(
    work: (transaction: TransactionContext) => Promise<Result>,
  ): Promise<Result>;
  findActiveCart(owner: CartOwner, transaction?: TransactionContext): Promise<CartRecord | null>;
  findCartById(id: string, transaction?: TransactionContext): Promise<CartRecord | null>;
  createCart(
    input: Readonly<{
      id: string;
      owner: CartOwner;
      currency: string;
      locale: string;
      expiresAt: Date;
    }>,
    transaction: TransactionContext,
  ): Promise<CartRecord>;
  /**
   * Serializes active-cart lookup/create and anonymous-to-user handoff for one
   * logical owner, including when there is not yet a cart row to lock.
   */
  lockCartOwner(owner: CartOwner, transaction: TransactionContext): Promise<void>;
  lockCart(id: string, transaction: TransactionContext): Promise<CartRecord | null>;
  claimAddIdempotency(
    transaction: TransactionContext,
    lookup: CartAddIdempotencyLookup,
  ): Promise<CartAddIdempotencyClaim | null>;
  completeAddIdempotency(
    transaction: TransactionContext,
    lookup: CartAddIdempotencyLookup,
    cartId: string,
  ): Promise<void>;
  abandonCart(id: string, transaction: TransactionContext): Promise<void>;
  updateCart(
    id: string,
    input: Readonly<{
      userId?: string | null;
      anonymousId?: string | null;
      currency?: string;
      locale?: string;
      status?: CartStatus;
      couponCode?: string | null;
      expiresAt?: Date;
    }>,
    transaction: TransactionContext,
  ): Promise<CartRecord>;
  listLines(
    cartId: string,
    locale: string,
    transaction?: TransactionContext,
  ): Promise<readonly CartLineRecord[]>;
  getVariant(
    variantId: string,
    locale: string,
  ): Promise<Readonly<{ id: string; product: CartProductSummary }> | null>;
  getLine(
    id: string,
    locale: string,
    transaction?: TransactionContext,
  ): Promise<CartLineRecord | null>;
  upsertLine(
    input: Readonly<{
      cartId: string;
      variantId: string;
      quantity: number;
      actorUserId: string | null;
    }>,
    transaction: TransactionContext,
  ): Promise<void>;
  updateLineQuantity(
    id: string,
    quantity: number,
    actorUserId: string | null,
    transaction: TransactionContext,
  ): Promise<void>;
  deleteLine(id: string, transaction: TransactionContext): Promise<void>;
  findCoupon(code: string): Promise<CouponRecord | null>;
  countCouponRedemptions(couponId: string, userId: string): Promise<number>;
  pricesForVariants(
    variantIds: readonly string[],
    currency: string,
    now: Date,
  ): Promise<readonly VariantPriceRecord[]>;
  appendSecurityAudit(
    input: Readonly<{
      actorUserId: string | null;
      subjectId: string;
      requestId: string;
      clientIp: string | null;
      offendingField: string;
    }>,
  ): Promise<void>;
  close(): Promise<void>;
}
