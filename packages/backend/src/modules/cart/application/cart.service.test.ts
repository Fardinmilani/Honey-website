import { describe, expect, it } from 'vitest';

import { TransactionContext } from '../../../platform/domain/transaction.js';
import {
  allocateProportionalDiscount,
  calculateTax,
  evaluateCoupon,
  type CouponLine,
  type CouponRecord,
  type DiscountAllocationLine,
  type VariantPriceRecord,
} from '../../pricing/index.js';
import type {
  CartAvailability,
  CartAvailabilityPort,
  CartAddIdempotencyClaim,
  CartAddIdempotencyLookup,
  CartConfig,
  CartLineRecord,
  CartOwner,
  CartPricingPort,
  CartProductSummary,
  CartRecord,
  CartRepository,
  CartStatus,
} from '../domain/cart.js';
import type { CartMediaPort } from '../domain/cart-media.port.js';
import { CartService, type CartRequestContext } from './cart.service.js';

const ANONYMOUS_ID = '018f0000-0000-7000-8000-000000000201';
const USER_ID = '018f0000-0000-7000-8000-000000000202';
const VARIANT_A = '018f0000-0000-7000-8000-000000000203';
const VARIANT_B = '018f0000-0000-7000-8000-000000000204';
const PRODUCT_A = '018f0000-0000-7000-8000-000000000205';
const PRODUCT_B = '018f0000-0000-7000-8000-000000000206';
const PRODUCT_A_IMAGE = '018f0000-0000-7000-8000-000000000207';
const PRODUCT_B_IMAGE = '018f0000-0000-7000-8000-000000000208';

class MemoryTransaction extends TransactionContext {}

class MemoryRepository implements CartRepository {
  readonly carts = new Map<string, CartRecord>();
  readonly lines = new Map<string, CartLineRecord>();
  readonly products = new Map<string, CartProductSummary>();
  readonly securityFields: string[] = [];
  readonly idempotency = new Map<string, CartAddIdempotencyClaim>();
  #lineSequence = 300;

  constructor() {
    this.products.set(VARIANT_A, product(PRODUCT_A, 'Spring thyme', 'spring-thyme'));
    this.products.set(VARIANT_B, product(PRODUCT_B, 'Mountain flower', 'mountain-flower'));
  }

  runInTransaction<Result>(
    work: (transaction: TransactionContext) => Promise<Result>,
  ): Promise<Result> {
    return work(new MemoryTransaction());
  }

  async findActiveCart(owner: CartOwner): Promise<CartRecord | null> {
    for (const cart of this.carts.values()) {
      if (cart.status !== 'ACTIVE') continue;
      if (owner.userId !== undefined && cart.userId === owner.userId) return cart;
      if (owner.anonymousId !== undefined && cart.anonymousId === owner.anonymousId) return cart;
    }
    return null;
  }

  async findCartById(id: string): Promise<CartRecord | null> {
    return this.carts.get(id) ?? null;
  }

  async createCart(
    input: Readonly<{
      id: string;
      owner: CartOwner;
      currency: string;
      locale: string;
      expiresAt: Date;
    }>,
  ): Promise<CartRecord> {
    const created: CartRecord = {
      id: input.id,
      userId: input.owner.userId ?? null,
      anonymousId: input.owner.anonymousId ?? null,
      currency: input.currency,
      locale: input.locale,
      status: 'ACTIVE',
      couponCode: null,
      expiresAt: input.expiresAt,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.carts.set(created.id, created);
    return created;
  }

  async lockCartOwner(): Promise<void> {}

  async claimAddIdempotency(
    _transaction: TransactionContext,
    lookup: CartAddIdempotencyLookup,
  ): Promise<CartAddIdempotencyClaim | null> {
    const id = `${lookup.scope}:${lookup.key}`;
    const existing = this.idempotency.get(id);
    if (existing !== undefined) return existing;
    this.idempotency.set(id, { requestHash: lookup.requestHash, completed: false });
    return null;
  }

  async completeAddIdempotency(
    _transaction: TransactionContext,
    lookup: CartAddIdempotencyLookup,
  ): Promise<void> {
    this.idempotency.set(`${lookup.scope}:${lookup.key}`, {
      requestHash: lookup.requestHash,
      completed: true,
    });
  }

  async lockCart(id: string): Promise<CartRecord | null> {
    return this.carts.get(id) ?? null;
  }

  async abandonCart(id: string): Promise<void> {
    const existing = this.carts.get(id);
    if (existing !== undefined) this.carts.set(id, { ...existing, status: 'ABANDONED' });
  }

  async updateCart(
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
  ): Promise<CartRecord> {
    const existing = this.carts.get(id);
    if (existing === undefined) throw new Error('missing cart');
    const updated: CartRecord = {
      ...existing,
      ...(input.userId === undefined ? {} : { userId: input.userId }),
      ...(input.anonymousId === undefined ? {} : { anonymousId: input.anonymousId }),
      ...(input.currency === undefined ? {} : { currency: input.currency }),
      ...(input.locale === undefined ? {} : { locale: input.locale }),
      ...(input.status === undefined ? {} : { status: input.status }),
      ...(input.couponCode === undefined ? {} : { couponCode: input.couponCode }),
      ...(input.expiresAt === undefined ? {} : { expiresAt: input.expiresAt }),
      updatedAt: new Date(),
    };
    this.carts.set(id, updated);
    return updated;
  }

  async listLines(cartId: string): Promise<readonly CartLineRecord[]> {
    return [...this.lines.values()].filter((line) => line.cartId === cartId).sort(byLineId);
  }

  async getVariant(
    variantId: string,
  ): Promise<Readonly<{ id: string; product: CartProductSummary }> | null> {
    const item = this.products.get(variantId);
    return item === undefined ? null : { id: variantId, product: item };
  }

  async getLine(id: string): Promise<CartLineRecord | null> {
    return this.lines.get(id) ?? null;
  }

  async upsertLine(
    input: Readonly<{ cartId: string; variantId: string; quantity: number }>,
  ): Promise<void> {
    const existing = [...this.lines.values()].find(
      (line) => line.cartId === input.cartId && line.variantId === input.variantId,
    );
    if (existing !== undefined) {
      this.lines.set(existing.id, { ...existing, quantity: input.quantity });
      return;
    }
    const product = this.products.get(input.variantId);
    if (product === undefined) throw new Error('missing product');
    const id = `018f0000-0000-7000-8000-${this.#lineSequence.toString(16).padStart(12, '0')}`;
    this.#lineSequence += 1;
    this.lines.set(id, {
      id,
      cartId: input.cartId,
      variantId: input.variantId,
      quantity: input.quantity,
      addedAt: new Date(),
      product,
    });
  }

  async updateLineQuantity(id: string, quantity: number): Promise<void> {
    const existing = this.lines.get(id);
    if (existing === undefined) throw new Error('missing line');
    this.lines.set(id, { ...existing, quantity });
  }

  async deleteLine(id: string): Promise<void> {
    this.lines.delete(id);
  }

  async findCoupon(): Promise<CouponRecord | null> {
    return null;
  }

  async countCouponRedemptions(): Promise<number> {
    return 0;
  }

  async pricesForVariants(): Promise<readonly VariantPriceRecord[]> {
    return [];
  }

  async appendSecurityAudit(input: Readonly<{ offendingField: string }>): Promise<void> {
    this.securityFields.push(input.offendingField);
  }

  async close(): Promise<void> {}
}

class MemoryAvailability implements CartAvailabilityPort {
  readonly quantities = new Map<string, number>([
    [VARIANT_A, 7],
    [VARIANT_B, 4],
  ]);

  async availabilityForVariants(
    variantIds: readonly string[],
  ): Promise<readonly CartAvailability[]> {
    return variantIds.map((variantId) => {
      const quantity = this.quantities.get(variantId) ?? 0;
      return {
        variantId,
        availableToSell: quantity,
        band: quantity === 0 ? 'OUT_OF_STOCK' : quantity <= 2 ? 'LOW_STOCK' : 'IN_STOCK',
      };
    });
  }
}

class MemoryPricing implements CartPricingPort {
  readonly coupons = new Map<string, CouponRecord>([
    [
      'TENOFF',
      {
        id: '018f0000-0000-7000-8000-000000000210',
        code: 'TENOFF',
        type: 'PERCENT',
        value: 1000n,
        currency: null,
        minSubtotalMinor: null,
        maxDiscountMinor: null,
        startsAt: new Date('2020-01-01T00:00:00.000Z'),
        endsAt: null,
        usageLimitTotal: null,
        usageLimitPerUser: null,
        usedCount: 0,
        appliesTo: 'ALL',
        targetIds: [],
        status: 'ACTIVE',
      },
    ],
  ]);

  async resolvePrices(
    variantIds: readonly string[],
    currency: string,
  ): Promise<ReadonlyMap<string, VariantPriceRecord>> {
    const amountByVariant = new Map<string, bigint>([
      [VARIANT_A, 101n],
      [VARIANT_B, 100n],
    ]);
    const prices = new Map<string, VariantPriceRecord>();
    for (const variantId of variantIds) {
      const amountMinor = amountByVariant.get(variantId);
      if (amountMinor === undefined) continue;
      prices.set(variantId, {
        id: `price-${variantId}`,
        variantId,
        currency,
        amountMinor,
        compareAtMinor: null,
        validFrom: new Date('2020-01-01T00:00:00.000Z'),
        validTo: null,
      });
    }
    return prices;
  }

  async evaluateCoupon(
    code: string,
    currency: string,
    now: Date,
    cartSubtotalMinor: bigint,
    lines: readonly CouponLine[],
  ) {
    const coupon = this.coupons.get(code) ?? null;
    return {
      coupon,
      couponEvaluation:
        coupon === null
          ? null
          : evaluateCoupon({
              coupon,
              currency,
              now,
              cartSubtotalMinor,
              lines,
              customerRedemptionCount: null,
            }),
    };
  }

  allocateDiscount(lines: readonly DiscountAllocationLine[], discountMinor: bigint) {
    return allocateProportionalDiscount(lines, discountMinor);
  }

  unresolvedTax(taxableAmountMinor: bigint) {
    return calculateTax({ taxableAmountMinor, rate: null });
  }
}

class MemoryMedia implements CartMediaPort {
  readonly requests: string[][] = [];

  async resolvePublicImages(assetIds: readonly string[]) {
    this.requests.push([...assetIds]);
    return assetIds.flatMap((id) =>
      id === PRODUCT_A_IMAGE ? [{ id, url: 'https://media.example.invalid/products/a.webp' }] : [],
    );
  }
}

const config: CartConfig = {
  activeTtlMs: 30 * 24 * 60 * 60 * 1_000,
  maximumLineQuantity: 1_000,
  defaultCurrency: 'IRR',
  enabledCurrencies: ['IRR'],
};

const anonymousContext: CartRequestContext = {
  userId: null,
  anonymousId: ANONYMOUS_ID,
  locale: 'en',
  currency: 'IRR',
};

function product(productId: string, name: string, slug: string): CartProductSummary {
  return {
    productId,
    productName: name,
    productSlug: slug,
    variantName: '450 g jar',
    netWeightGrams: 450,
    imageAssetIds: [productId === PRODUCT_A ? PRODUCT_A_IMAGE : PRODUCT_B_IMAGE],
    imageUrl: null,
    categoryIds: [],
    collectionIds: [],
    published: true,
  };
}

function byLineId(left: CartLineRecord, right: CartLineRecord): number {
  return left.id.localeCompare(right.id);
}

function service(media?: CartMediaPort) {
  const repository = new MemoryRepository();
  const availability = new MemoryAvailability();
  const pricing = new MemoryPricing();
  return {
    repository,
    availability,
    service: new CartService(repository, availability, pricing, config, media),
  };
}

describe('CartService', () => {
  it('reprices, allocates discounts exactly, and clamps a reduced availability on read', async () => {
    const harness = service();
    await harness.service.addLine(anonymousContext, { variantId: VARIANT_A, quantity: 2 });
    await harness.service.addLine(anonymousContext, { variantId: VARIANT_B, quantity: 1 });
    const discounted = await harness.service.applyCoupon(anonymousContext, 'tenoff');
    expect(discounted.subtotal.amountMinor).toBe('302');
    expect(discounted.discountTotal.amountMinor).toBe('30');
    expect(discounted.merchandiseTotal.amountMinor).toBe('272');
    expect(
      discounted.lines.reduce((sum, line) => sum + BigInt(line.lineTotal.amountMinor), 0n),
    ).toBe(BigInt(discounted.merchandiseTotal.amountMinor));

    harness.availability.quantities.set(VARIANT_A, 1);
    const clamped = await harness.service.getCart(anonymousContext);
    expect(clamped.adjustments).toHaveLength(1);
    expect(clamped.lines.find((line) => line.variantId === VARIANT_A)?.quantity).toBe(1);
    expect(clamped.subtotal.amountMinor).toBe('201');
    expect(clamped.discountTotal.amountMinor).toBe('20');
    expect(clamped.merchandiseTotal.amountMinor).toBe('181');
  });

  it('returns a quantity adjustment when an add or update is clamped at mutation time', async () => {
    const harness = service();
    harness.availability.quantities.set(VARIANT_A, 2);

    const added = await harness.service.addLine(anonymousContext, {
      variantId: VARIANT_A,
      quantity: 3,
    });
    const lineId = added.lines.find((line) => line.variantId === VARIANT_A)?.id;
    expect(lineId).toBeDefined();
    if (lineId === undefined) throw new Error('Expected the clamped line to exist.');
    expect(added.lines.find((line) => line.id === lineId)?.quantity).toBe(2);
    expect(added.adjustments).toEqual([{ code: 'QUANTITY_CLAMPED', lineId }]);

    harness.availability.quantities.set(VARIANT_A, 1);
    const updated = await harness.service.updateLine(anonymousContext, lineId, { quantity: 2 });
    expect(updated.lines.find((line) => line.id === lineId)?.quantity).toBe(1);
    expect(updated.adjustments).toEqual([{ code: 'QUANTITY_CLAMPED', lineId }]);
  });

  it('merges an anonymous cart once, clamps combined quantity, and leaves no duplicate line', async () => {
    const harness = service();
    await harness.service.addLine(anonymousContext, { variantId: VARIANT_A, quantity: 1 });
    await harness.service.addLine(anonymousContext, { variantId: VARIANT_B, quantity: 1 });
    await harness.service.addLine(
      { ...anonymousContext, userId: USER_ID, anonymousId: null },
      { variantId: VARIANT_A, quantity: 2 },
    );
    harness.availability.quantities.set(VARIANT_A, 2);
    const signedInContext = { ...anonymousContext, userId: USER_ID };
    const merged = await harness.service.getCart(signedInContext);
    expect(merged.lines).toHaveLength(2);
    expect(merged.lines.find((line) => line.variantId === VARIANT_A)?.quantity).toBe(2);
    expect(merged.lines.find((line) => line.variantId === VARIANT_B)?.quantity).toBe(1);
    const repeated = await harness.service.getCart(signedInContext);
    expect(repeated.lines).toHaveLength(2);
    expect(repeated.lines.find((line) => line.variantId === VARIANT_A)?.quantity).toBe(2);
    expect([...harness.repository.carts.values()].some((cart) => cart.status === 'MERGED')).toBe(
      true,
    );
  });

  it('records only the offending field for a detected money tampering attempt', async () => {
    const harness = service();
    await harness.service.recordTamperingAttempt({
      actorUserId: null,
      anonymousId: ANONYMOUS_ID,
      requestId: 'request-1',
      clientIp: '127.0.0.1',
      offendingField: 'total',
    });
    expect(harness.repository.securityFields).toEqual(['total']);
  });

  it('uses the media module’s public image URL for a cart line', async () => {
    const media = new MemoryMedia();
    const harness = service(media);
    const cart = await harness.service.addLine(anonymousContext, {
      variantId: VARIANT_A,
      quantity: 1,
    });

    expect(media.requests).toEqual([[PRODUCT_A_IMAGE]]);
    expect(cart.lines[0]?.product.imageUrl).toBe('https://media.example.invalid/products/a.webp');
  });

  it('replays an incrementing add once for the same idempotency key', async () => {
    const harness = service();
    const input = { variantId: VARIANT_A, quantity: 1 };
    const key = 'cart-add-retry-key-0001';
    const first = await harness.service.addLineWithIdempotency(anonymousContext, input, key);
    const replay = await harness.service.addLineWithIdempotency(anonymousContext, input, key);

    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.cart.lines).toHaveLength(1);
    expect(replay.cart.lines[0]?.quantity).toBe(1);
    await expect(
      harness.service.addLineWithIdempotency(
        anonymousContext,
        { variantId: VARIANT_A, quantity: 2 },
        key,
      ),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      errors: [{ path: 'idempotencyKey', code: 'IDEMPOTENCY_KEY_REUSE' }],
    });
  });
});
