import { createHash, randomUUID } from 'node:crypto';

import { ConflictAppError, NotFoundAppError, ValidationAppError } from '../../../errors/index.js';
import type { TransactionContext } from '../../../platform/domain/transaction.js';
import {
  normalizeCouponCode,
  normalizeCurrency,
  serializeMoney,
  type CouponLine,
} from '../../pricing/index.js';
import type {
  CartAddIdempotencyLookup,
  CartAvailability,
  CartConfig,
  CartLineRecord,
  CartLineState,
  CartOwner,
  CartPricingPort,
  CartRecord,
  CartRepository,
  CartView,
  CartViewLine,
} from '../domain/cart.js';
import type { CartAvailabilityPort } from '../domain/cart.js';
import type { CartMediaPort } from '../domain/cart-media.port.js';

export type CartRequestContext = Readonly<{
  userId: string | null;
  anonymousId: string | null;
  locale: string;
  currency: string;
}>;

export type AddCartLineInput = Readonly<{
  variantId: string;
  quantity: number;
}>;

export type CartAddLineResult = Readonly<{
  cart: CartView;
  replayed: boolean;
}>;

export type UpdateCartLineInput = Readonly<{
  quantity: number;
}>;

export type CartTamperingAttempt = Readonly<{
  actorUserId: string | null;
  anonymousId?: string;
  requestId: string;
  clientIp: string | null;
  offendingField: string;
}>;

type NormalizedContext = Readonly<{
  userId: string | null;
  anonymousId: string | null;
  locale: string;
  currency: string;
}>;

type PricedLine = Readonly<{
  line: CartLineRecord;
  state: CartLineState;
  availability: CartAvailability;
  unitPriceMinor: bigint;
  subtotalMinor: bigint;
}>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const LOCALE = /^[a-z]{2,3}(?:-[A-Z]{2})?$/u;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/u;

function validation(path: string, code: string): ValidationAppError {
  return new ValidationAppError([{ path, code }]);
}

function uuid(value: string, path: string): string {
  if (!UUID.test(value)) throw validation(path, 'CART_ID_INVALID');
  return value;
}

function boundedQuantity(value: number, maximum: number, path: string): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw validation(path, 'CART_QUANTITY_INVALID');
  }
  return value;
}

function idempotencyKey(value: string): string {
  if (!IDEMPOTENCY_KEY.test(value)) {
    throw validation('idempotencyKey', 'IDEMPOTENCY_KEY_INVALID');
  }
  return value;
}

function normalizeLocale(value: string): string {
  const candidate = value.normalize('NFKC').trim();
  if (!LOCALE.test(candidate)) throw validation('locale', 'CART_LOCALE_INVALID');
  return candidate;
}

function normalizeCartCurrency(value: string, enabledCurrencies: readonly string[]): string {
  try {
    const currency = normalizeCurrency(value);
    if (!enabledCurrencies.includes(currency)) throw new Error('currency disabled');
    return currency;
  } catch {
    throw validation('currency', 'CART_CURRENCY_INVALID');
  }
}

function ownerFor(context: NormalizedContext): CartOwner {
  if (context.userId !== null) return { userId: context.userId };
  if (context.anonymousId === null) throw validation('cart', 'CART_OWNER_REQUIRED');
  return { anonymousId: context.anonymousId };
}

function addIdempotencyLookup(
  context: NormalizedContext,
  input: AddCartLineInput,
  key: string,
): CartAddIdempotencyLookup {
  const ownerId = context.userId ?? context.anonymousId;
  if (ownerId === null) throw validation('cart', 'CART_OWNER_REQUIRED');
  const ownerKind = context.userId === null ? 'anonymous' : 'user';
  const requestHash = createHash('sha256')
    .update(
      JSON.stringify({
        currency: context.currency,
        quantity: input.quantity,
        variantId: input.variantId,
      }),
      'utf8',
    )
    .digest('hex');
  return {
    key,
    scope: `cart.add.${ownerKind}:${ownerId}`,
    userId: context.userId,
    requestHash,
  };
}

function laterThan(now: Date, ttlMs: number): Date {
  return new Date(now.getTime() + ttlMs);
}

function money(amountMinor: bigint, currency: string) {
  return serializeMoney({ amountMinor, currency });
}

function sumMinor(values: readonly bigint[]): bigint {
  return values.reduce((total, value) => total + value, 0n);
}

function safeImageUrl(value: string | null): string | null {
  if (value === null) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Owns cart identity and mutable selections only. Prices, availability, discounts and taxes are
 * recomputed from their owning modules whenever a view is produced.
 */
export class CartService {
  constructor(
    private readonly repository: CartRepository,
    private readonly availability: CartAvailabilityPort,
    private readonly pricing: CartPricingPort,
    private readonly config: CartConfig,
    private readonly media?: CartMediaPort,
  ) {}

  async getCart(contextInput: CartRequestContext): Promise<CartView> {
    const context = this.#context(contextInput);
    await this.#mergeIfNecessary(context);
    const cart = await this.#activeCart(context, false);
    return this.#render(cart, context, true);
  }

  async addLine(contextInput: CartRequestContext, input: AddCartLineInput): Promise<CartView> {
    return (await this.addLineWithIdempotency(contextInput, input, randomUUID())).cart;
  }

  async addLineWithIdempotency(
    contextInput: CartRequestContext,
    input: AddCartLineInput,
    idempotencyKeyInput: string,
  ): Promise<CartAddLineResult> {
    const context = this.#context(contextInput);
    const variantId = uuid(input.variantId, 'variantId');
    const requestedQuantity = boundedQuantity(
      input.quantity,
      this.config.maximumLineQuantity,
      'quantity',
    );
    const lookup = addIdempotencyLookup(
      context,
      { variantId, quantity: requestedQuantity },
      idempotencyKey(idempotencyKeyInput),
    );
    const variant = await this.repository.getVariant(variantId, context.locale);
    if (variant === null || !variant.product.published) {
      throw new NotFoundAppError({ code: 'CART_VARIANT_NOT_AVAILABLE' });
    }
    await this.#mergeIfNecessary(context);
    const result = await this.repository.runInTransaction(async (transaction) => {
      await this.repository.lockCartOwner(ownerFor(context), transaction);
      const claim = await this.repository.claimAddIdempotency(transaction, lookup);
      if (claim !== null) {
        if (claim.requestHash !== lookup.requestHash) {
          throw validation('idempotencyKey', 'IDEMPOTENCY_KEY_REUSE');
        }
        if (!claim.completed) {
          throw new ConflictAppError({ code: 'IDEMPOTENCY_KEY_IN_PROGRESS' });
        }
        return {
          cart: await this.#activeCartInTransaction(context, true, transaction, true),
          replayed: true,
          clamped: false,
        };
      }
      const active = await this.#activeCartInTransaction(context, true, transaction, true);
      const snapshot = await this.#availabilityFor(variantId);
      if (snapshot.availableToSell < 1) {
        throw new ConflictAppError({ code: 'CART_VARIANT_OUT_OF_STOCK' });
      }
      const lines = await this.repository.listLines(active.id, context.locale, transaction);
      const matching = lines.find((line) => line.variantId === variantId);
      const current = matching?.quantity ?? 0;
      const quantity = Math.min(
        this.config.maximumLineQuantity,
        snapshot.availableToSell,
        current + requestedQuantity,
      );
      await this.repository.upsertLine(
        {
          cartId: active.id,
          variantId,
          quantity,
          actorUserId: context.userId,
        },
        transaction,
      );
      await this.repository.completeAddIdempotency(transaction, lookup, active.id);
      return {
        cart: active,
        replayed: false,
        clamped: quantity < current + requestedQuantity,
      };
    });
    const cart = await this.#render(result.cart, context, true);
    const adjustmentLine =
      result.clamped === true ? cart.lines.find((line) => line.variantId === variantId) : undefined;
    return {
      cart:
        adjustmentLine === undefined
          ? cart
          : this.#withOperationAdjustment(cart, adjustmentLine.id),
      replayed: result.replayed,
    };
  }

  async updateLine(
    contextInput: CartRequestContext,
    lineIdInput: string,
    input: UpdateCartLineInput,
  ): Promise<CartView> {
    const context = this.#context(contextInput);
    const lineId = uuid(lineIdInput, 'lineId');
    const requestedQuantity = boundedQuantity(
      input.quantity,
      this.config.maximumLineQuantity,
      'quantity',
    );
    await this.#mergeIfNecessary(context);
    const result = await this.repository.runInTransaction(async (transaction) => {
      const active = await this.#activeCartInTransaction(context, true, transaction);
      const line = await this.repository.getLine(lineId, context.locale, transaction);
      if (line === null || line.cartId !== active.id) {
        throw new NotFoundAppError({ code: 'CART_LINE_NOT_FOUND' });
      }
      const snapshot = await this.#availabilityFor(line.variantId);
      if (snapshot.availableToSell < 1) {
        throw new ConflictAppError({ code: 'CART_VARIANT_OUT_OF_STOCK' });
      }
      const quantity = Math.min(requestedQuantity, snapshot.availableToSell);
      await this.repository.updateLineQuantity(line.id, quantity, context.userId, transaction);
      return { cart: active, clamped: quantity < requestedQuantity, lineId: line.id };
    });
    const cart = await this.#render(result.cart, context, true);
    return result.clamped ? this.#withOperationAdjustment(cart, result.lineId) : cart;
  }

  async removeLine(contextInput: CartRequestContext, lineIdInput: string): Promise<CartView> {
    const context = this.#context(contextInput);
    const lineId = uuid(lineIdInput, 'lineId');
    await this.#mergeIfNecessary(context);
    const cart = await this.repository.runInTransaction(async (transaction) => {
      const active = await this.#activeCartInTransaction(context, true, transaction);
      const line = await this.repository.getLine(lineId, context.locale, transaction);
      if (line === null || line.cartId !== active.id) {
        throw new NotFoundAppError({ code: 'CART_LINE_NOT_FOUND' });
      }
      await this.repository.deleteLine(line.id, transaction);
      return active;
    });
    return this.#render(cart, context, true);
  }

  async applyCoupon(contextInput: CartRequestContext, codeInput: string): Promise<CartView> {
    const context = this.#context(contextInput);
    let code: string;
    try {
      code = normalizeCouponCode(codeInput);
    } catch {
      throw validation('code', 'COUPON_CODE_INVALID');
    }
    await this.#mergeIfNecessary(context);
    const cart = await this.#activeCart(context, true);
    const lines = await this.repository.listLines(cart.id, context.locale);
    const priced = await this.#priceLines(lines, cart.currency, new Date());
    const subtotalMinor = sumMinor(priced.map((line) => line.subtotalMinor));
    const couponLines = priced.map((line) => this.#couponLine(line));
    const evaluated = await this.pricing.evaluateCoupon(
      code,
      cart.currency,
      new Date(),
      subtotalMinor,
      couponLines,
      context.userId,
    );
    if (
      evaluated.coupon === null ||
      evaluated.couponEvaluation === null ||
      !evaluated.couponEvaluation.eligible
    ) {
      throw validation('code', 'COUPON_INVALID');
    }
    const updated = await this.repository.runInTransaction(async (transaction) => {
      const active = await this.#activeCartInTransaction(context, true, transaction);
      return this.repository.updateCart(
        active.id,
        { couponCode: code, expiresAt: laterThan(new Date(), this.config.activeTtlMs) },
        transaction,
      );
    });
    return this.#render(updated, context, true);
  }

  async removeCoupon(contextInput: CartRequestContext): Promise<CartView> {
    const context = this.#context(contextInput);
    await this.#mergeIfNecessary(context);
    const cart = await this.repository.runInTransaction(async (transaction) => {
      const active = await this.#activeCartInTransaction(context, true, transaction);
      return this.repository.updateCart(
        active.id,
        { couponCode: null, expiresAt: laterThan(new Date(), this.config.activeTtlMs) },
        transaction,
      );
    });
    return this.#render(cart, context, true);
  }

  /** Called lazily on authenticated cart access, which makes retrying a login/cart handoff safe. */
  async mergeAnonymousIntoUser(contextInput: CartRequestContext): Promise<void> {
    const context = this.#context(contextInput);
    await this.#mergeIfNecessary(context);
  }

  async recordTamperingAttempt(input: CartTamperingAttempt): Promise<void> {
    const subjectId =
      input.anonymousId !== undefined && UUID.test(input.anonymousId)
        ? input.anonymousId
        : randomUUID();
    await this.repository.appendSecurityAudit({
      actorUserId: input.actorUserId,
      subjectId,
      requestId: input.requestId,
      clientIp: input.clientIp,
      offendingField: input.offendingField,
    });
  }

  async #mergeIfNecessary(context: NormalizedContext): Promise<void> {
    if (context.userId === null || context.anonymousId === null) return;
    const userId = context.userId;
    const anonymousId = context.anonymousId;
    await this.repository.runInTransaction(async (transaction) => {
      const owners: readonly Readonly<{ key: string; owner: CartOwner }>[] = [
        { key: `anonymous:${anonymousId}`, owner: { anonymousId } },
        { key: `user:${userId}`, owner: { userId } },
      ];
      for (const { owner } of [...owners].sort((left, right) =>
        left.key.localeCompare(right.key),
      )) {
        await this.repository.lockCartOwner(owner, transaction);
      }
      const [userExisting, anonymousExisting] = await Promise.all([
        this.repository.findActiveCart({ userId }, transaction),
        this.repository.findActiveCart({ anonymousId }, transaction),
      ]);
      const ids = [userExisting?.id, anonymousExisting?.id]
        .filter((id): id is string => id !== undefined)
        .sort();
      const locked = new Map<string, CartRecord>();
      for (const id of ids) {
        const cart = await this.repository.lockCart(id, transaction);
        if (cart !== null) locked.set(id, cart);
      }
      let userCart = userExisting === null ? null : (locked.get(userExisting.id) ?? null);
      let anonymousCart =
        anonymousExisting === null ? null : (locked.get(anonymousExisting.id) ?? null);
      if (userCart !== null && userCart.expiresAt <= new Date()) {
        await this.repository.abandonCart(userCart.id, transaction);
        userCart = null;
      }
      if (anonymousCart !== null && anonymousCart.expiresAt <= new Date()) {
        await this.repository.abandonCart(anonymousCart.id, transaction);
        anonymousCart = null;
      }
      if (anonymousCart === null) return;
      if (userCart === null) {
        await this.repository.updateCart(
          anonymousCart.id,
          {
            userId,
            anonymousId: null,
            currency: context.currency,
            locale: context.locale,
            expiresAt: laterThan(new Date(), this.config.activeTtlMs),
          },
          transaction,
        );
        return;
      }
      const [userLines, anonymousLines] = await Promise.all([
        this.repository.listLines(userCart.id, context.locale, transaction),
        this.repository.listLines(anonymousCart.id, context.locale, transaction),
      ]);
      const availability = await this.availability.availabilityForVariants(
        anonymousLines.map((line) => line.variantId),
      );
      const availableByVariant = new Map(availability.map((entry) => [entry.variantId, entry]));
      const quantityByVariant = new Map(userLines.map((line) => [line.variantId, line.quantity]));
      for (const line of anonymousLines) {
        const snapshot = availableByVariant.get(line.variantId);
        const current = quantityByVariant.get(line.variantId) ?? 0;
        const quantity = Math.min(
          this.config.maximumLineQuantity,
          snapshot?.availableToSell ?? 0,
          current + line.quantity,
        );
        if (quantity > 0) {
          await this.repository.upsertLine(
            {
              cartId: userCart.id,
              variantId: line.variantId,
              quantity,
              actorUserId: userId,
            },
            transaction,
          );
          quantityByVariant.set(line.variantId, quantity);
        }
        await this.repository.deleteLine(line.id, transaction);
      }
      await this.repository.updateCart(
        userCart.id,
        {
          couponCode: userCart.couponCode ?? anonymousCart.couponCode,
          currency: context.currency,
          locale: context.locale,
          expiresAt: laterThan(new Date(), this.config.activeTtlMs),
        },
        transaction,
      );
      await this.repository.updateCart(
        anonymousCart.id,
        { status: 'MERGED', expiresAt: new Date() },
        transaction,
      );
    });
  }

  async #activeCart(context: NormalizedContext, touch: boolean): Promise<CartRecord> {
    return this.repository.runInTransaction((transaction) =>
      this.#activeCartInTransaction(context, touch, transaction),
    );
  }

  async #activeCartInTransaction(
    context: NormalizedContext,
    touch: boolean,
    transaction: TransactionContext,
    ownerLockHeld = false,
  ): Promise<CartRecord> {
    const owner = ownerFor(context);
    if (!ownerLockHeld) await this.repository.lockCartOwner(owner, transaction);
    let cart = await this.repository.findActiveCart(owner, transaction);
    if (cart !== null) cart = await this.repository.lockCart(cart.id, transaction);
    const now = new Date();
    if (cart !== null && cart.expiresAt <= now) {
      await this.repository.abandonCart(cart.id, transaction);
      cart = null;
    }
    if (cart === null) {
      return this.repository.createCart(
        {
          id: randomUUID(),
          owner,
          currency: context.currency,
          locale: context.locale,
          expiresAt: laterThan(now, this.config.activeTtlMs),
        },
        transaction,
      );
    }
    const changes: {
      currency?: string;
      locale?: string;
      expiresAt?: Date;
    } = {};
    if (cart.currency !== context.currency) changes.currency = context.currency;
    if (cart.locale !== context.locale) changes.locale = context.locale;
    if (touch) changes.expiresAt = laterThan(now, this.config.activeTtlMs);
    return Object.keys(changes).length === 0
      ? cart
      : this.repository.updateCart(cart.id, changes, transaction);
  }

  async #render(
    cart: CartRecord,
    context: NormalizedContext,
    allowClamp: boolean,
  ): Promise<CartView> {
    const lines = await this.repository.listLines(cart.id, context.locale);
    const availability = await this.availability.availabilityForVariants(
      lines.map((line) => line.variantId),
    );
    const byVariant = new Map(availability.map((entry) => [entry.variantId, entry]));
    const clamps = lines.filter((line) => {
      const snapshot = byVariant.get(line.variantId);
      return (
        snapshot !== undefined &&
        snapshot.availableToSell > 0 &&
        snapshot.availableToSell < line.quantity
      );
    });
    if (allowClamp && clamps.length > 0) {
      await this.repository.runInTransaction(async (transaction) => {
        const locked = await this.repository.lockCart(cart.id, transaction);
        if (locked === null || locked.status !== 'ACTIVE') return;
        for (const line of clamps) {
          const latest = await this.repository.getLine(line.id, context.locale, transaction);
          const snapshot = byVariant.get(line.variantId);
          if (
            latest !== null &&
            latest.cartId === cart.id &&
            snapshot !== undefined &&
            snapshot.availableToSell > 0 &&
            snapshot.availableToSell < latest.quantity
          ) {
            await this.repository.updateLineQuantity(
              latest.id,
              snapshot.availableToSell,
              context.userId,
              transaction,
            );
          }
        }
      });
      const refreshed = await this.repository.findCartById(cart.id);
      if (refreshed === null) throw new NotFoundAppError({ code: 'CART_NOT_FOUND' });
      const rendered = await this.#render(refreshed, context, false);
      return {
        ...rendered,
        adjustments: clamps.map((line) => ({ code: 'QUANTITY_CLAMPED', lineId: line.id })),
      };
    }
    const priced = await this.#priceLines(lines, cart.currency, new Date(), byVariant);
    return this.#view(cart, priced, context);
  }

  #withOperationAdjustment(cart: CartView, lineId: string): CartView {
    if (cart.adjustments.some((adjustment) => adjustment.lineId === lineId)) return cart;
    return {
      ...cart,
      adjustments: [...cart.adjustments, { code: 'QUANTITY_CLAMPED', lineId }],
    };
  }

  async #priceLines(
    lines: readonly CartLineRecord[],
    currency: string,
    now: Date,
    suppliedAvailability?: ReadonlyMap<string, CartAvailability>,
  ): Promise<readonly PricedLine[]> {
    const [prices, availability] = await Promise.all([
      this.pricing.resolvePrices(
        lines.map((line) => line.variantId),
        currency,
        now,
      ),
      suppliedAvailability === undefined
        ? this.availability.availabilityForVariants(lines.map((line) => line.variantId))
        : Promise.resolve([]),
    ]);
    const availabilityByVariant =
      suppliedAvailability ?? new Map(availability.map((entry) => [entry.variantId, entry]));
    return lines.map((line) => {
      const snapshot = availabilityByVariant.get(line.variantId) ?? {
        variantId: line.variantId,
        availableToSell: 0,
        band: 'OUT_OF_STOCK' as const,
      };
      const price = prices.get(line.variantId);
      const state: CartLineState = !line.product.published
        ? 'UNPUBLISHED'
        : snapshot.availableToSell < 1
          ? 'OUT_OF_STOCK'
          : price === undefined
            ? 'PRICE_UNAVAILABLE'
            : 'PURCHASABLE';
      const unitPriceMinor =
        state === 'PURCHASABLE' && price !== undefined ? price.amountMinor : 0n;
      return {
        line,
        state,
        availability: snapshot,
        unitPriceMinor,
        subtotalMinor: unitPriceMinor * BigInt(line.quantity),
      };
    });
  }

  async #view(
    cart: CartRecord,
    priced: readonly PricedLine[],
    context: NormalizedContext,
  ): Promise<CartView> {
    const purchasable = priced.filter((line) => line.state === 'PURCHASABLE');
    const subtotalMinor = sumMinor(purchasable.map((line) => line.subtotalMinor));
    let discountMinor = 0n;
    let coupon: CartView['coupon'] = null;
    let allocations = new Map<string, bigint>();
    if (cart.couponCode !== null) {
      const result = await this.pricing.evaluateCoupon(
        cart.couponCode,
        cart.currency,
        new Date(),
        subtotalMinor,
        purchasable.map((line) => this.#couponLine(line)),
        context.userId,
      );
      if (
        result.coupon === null ||
        result.couponEvaluation === null ||
        !result.couponEvaluation.eligible
      ) {
        coupon = {
          code: cart.couponCode,
          state: 'INELIGIBLE',
          reason: result.couponEvaluation?.reason ?? 'COUPON_INVALID',
        };
      } else {
        const evaluation = result.couponEvaluation;
        discountMinor = evaluation.effect.discountMinor;
        const allocation = this.pricing.allocateDiscount(
          purchasable.map((line) => ({
            id: line.line.id,
            subtotalMinor: line.subtotalMinor,
            eligible: evaluation.eligibleLineIds.includes(line.line.id),
          })),
          discountMinor,
        );
        allocations = new Map(allocation.lines.map((line) => [line.id, line.discountMinor]));
        coupon = {
          code: cart.couponCode,
          state: evaluation.effect.shippingEffect === 'DEFERRED' ? 'DEFERRED' : 'APPLIED',
          reason: null,
        };
      }
    }
    const imageUrls = await this.#imageUrls(priced);
    const lines = priced.map((pricedLine) =>
      this.#viewLine(pricedLine, cart.currency, allocations, this.#imageUrl(pricedLine, imageUrls)),
    );
    const merchandiseTotalMinor = subtotalMinor - discountMinor;
    const tax = this.pricing.unresolvedTax(merchandiseTotalMinor);
    return {
      id: cart.id,
      locale: cart.locale,
      currency: cart.currency,
      expiresAt: cart.expiresAt.toISOString(),
      lines,
      coupon,
      subtotal: money(subtotalMinor, cart.currency),
      discountTotal: money(discountMinor, cart.currency),
      tax:
        tax.state === 'UNRESOLVED'
          ? { state: 'UNRESOLVED', amount: null }
          : { state: 'RESOLVED', amount: money(tax.taxAmountMinor, cart.currency) },
      merchandiseTotal: money(merchandiseTotalMinor, cart.currency),
      adjustments: [],
    };
  }

  #viewLine(
    priced: PricedLine,
    currency: string,
    allocations: ReadonlyMap<string, bigint>,
    imageUrl: string | null,
  ): CartViewLine {
    const discountMinor = allocations.get(priced.line.id) ?? 0n;
    return {
      id: priced.line.id,
      variantId: priced.line.variantId,
      product: {
        id: priced.line.product.productId,
        name: priced.line.product.productName,
        slug: priced.line.product.productSlug,
        imageUrl,
      },
      variant: {
        name: priced.line.product.variantName,
        netWeightGrams: priced.line.product.netWeightGrams,
      },
      quantity: priced.line.quantity,
      availabilityBand: priced.availability.band,
      state: priced.state,
      unitPrice: priced.state === 'PURCHASABLE' ? money(priced.unitPriceMinor, currency) : null,
      lineSubtotal: money(priced.subtotalMinor, currency),
      discount: money(discountMinor, currency),
      lineTotal: money(priced.subtotalMinor - discountMinor, currency),
    };
  }

  #couponLine(line: PricedLine): CouponLine {
    return {
      id: line.line.id,
      variantId: line.line.variantId,
      categoryIds: line.line.product.categoryIds,
      collectionIds: line.line.product.collectionIds,
      subtotalMinor: line.subtotalMinor,
    };
  }

  async #imageUrls(priced: readonly PricedLine[]): Promise<ReadonlyMap<string, string>> {
    if (this.media === undefined) return new Map();
    const assetIds = [...new Set(priced.flatMap((line) => line.line.product.imageAssetIds ?? []))];
    if (assetIds.length === 0) return new Map();
    const images = await this.media.resolvePublicImages(assetIds);
    const imageUrls = new Map<string, string>();
    for (const image of images) {
      const url = safeImageUrl(image.url);
      if (url !== null) imageUrls.set(image.id, url);
    }
    return imageUrls;
  }

  #imageUrl(priced: PricedLine, imageUrls: ReadonlyMap<string, string>): string | null {
    for (const assetId of priced.line.product.imageAssetIds ?? []) {
      const url = imageUrls.get(assetId);
      if (url !== undefined) return url;
    }
    return safeImageUrl(priced.line.product.imageUrl);
  }

  async #availabilityFor(variantId: string): Promise<CartAvailability> {
    const [snapshot] = await this.availability.availabilityForVariants([variantId]);
    return (
      snapshot ?? {
        variantId,
        availableToSell: 0,
        band: 'OUT_OF_STOCK',
      }
    );
  }

  #context(input: CartRequestContext): NormalizedContext {
    const userId = input.userId === null ? null : uuid(input.userId, 'userId');
    const anonymousId = input.anonymousId === null ? null : uuid(input.anonymousId, 'anonymousId');
    if (userId === null && anonymousId === null) throw validation('cart', 'CART_OWNER_REQUIRED');
    return {
      userId,
      anonymousId,
      locale: normalizeLocale(input.locale),
      currency: normalizeCartCurrency(input.currency, this.config.enabledCurrencies),
    };
  }
}
