import { createHash, randomUUID } from 'node:crypto';

import {
  ConflictAppError,
  DependencyUnavailableAppError,
  NotFoundAppError,
  ValidationAppError,
} from '../../../errors/index.js';
import type { JsonValue } from '../../../errors/index.js';
import type {
  TransactionContext,
  TransactionRunner,
} from '../../../platform/domain/transaction.js';
import type { CartService, CartRequestContext, CheckoutCartLineRecord } from '../../cart/index.js';
import type { InventoryService, InventoryActorContext } from '../../inventory/index.js';
import type { OrdersService } from '../../orders/index.js';
import type { PricingService, CheckoutPricingResult } from '../../pricing/index.js';
import type { CheckoutShippingQuotePort } from '../shipping/domain/checkout-shipping-quote.port.js';
import type {
  StandardShippingCharge,
  StandardShippingQuote,
} from '../shipping/domain/standard-shipping-quote.js';
import type {
  CheckoutAddress,
  CheckoutAddressInput,
  CheckoutJsonObject,
  CheckoutOwner,
  CheckoutRepository,
  CheckoutSessionRecord,
  StartCheckoutInput,
} from '../domain/checkout.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/u;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F-\u009F]/u;
const CONFIRMATION_IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1_000;

export type CheckoutRequestContext = CartRequestContext &
  Readonly<{
    requestId: string;
    clientIp: string | null;
  }>;

export type CheckoutMoney = Readonly<{ amountMinor: string; currency: string }>;

export type CheckoutPricingProjection = Readonly<{
  currency: string;
  subtotal: CheckoutMoney;
  discount: CheckoutMoney;
  merchandiseTotal: CheckoutMoney;
  tax: CheckoutMoney;
  total: CheckoutMoney;
}>;

export type CheckoutShippingProjection = Readonly<{
  methodCode: 'STANDARD';
  amount: CheckoutMoney;
  discount: CheckoutMoney;
  total: CheckoutMoney;
  expiresAt: string;
}>;

export type CheckoutProjection = Readonly<{
  id: string;
  status: CheckoutSessionRecord['status'];
  email: string;
  phone: string | null;
  shippingAddress: CheckoutAddress | null;
  billingAddress: CheckoutAddress | null;
  sameAsShipping: boolean;
  shippingQuote: CheckoutShippingProjection | null;
  reservationExpiresAt: string | null;
  pricing: CheckoutPricingProjection | null;
}>;

export type CheckoutConfirmationResult =
  | Readonly<{
      state: 'CONFIRMED';
      checkout: CheckoutProjection;
      orderNumber: string;
      replayed: boolean;
    }>
  | Readonly<{ state: 'PRICE_CHANGED'; checkout: CheckoutProjection }>;

type NormalizedContext = Readonly<{
  userId: string | null;
  anonymousId: string | null;
  locale: string;
  currency: string;
  requestId: string;
  clientIp: string | null;
}>;

type SnapshotBuild = Readonly<{
  value: CheckoutJsonObject;
  fingerprint: string;
  projection: CheckoutPricingProjection;
  shipping: CheckoutShippingProjection;
  grandTotalMinor: bigint;
}>;

function validation(path: string, code: string): ValidationAppError {
  return new ValidationAppError([{ path, code }]);
}

function uuid(value: string, path: string): string {
  if (!UUID.test(value)) throw validation(path, 'CHECKOUT_ID_INVALID');
  return value;
}

function idempotencyKey(value: string): string {
  if (!IDEMPOTENCY_KEY.test(value)) throw validation('idempotencyKey', 'IDEMPOTENCY_KEY_INVALID');
  return value;
}

function boundedText(value: string, path: string, maximum: number): string {
  const normalized = value.normalize('NFC').trim();
  if (
    normalized.length < 1 ||
    Array.from(normalized).length > maximum ||
    CONTROL_CHARACTERS.test(normalized)
  ) {
    throw validation(path, 'CHECKOUT_TEXT_INVALID');
  }
  return normalized;
}

function optionalText(
  value: string | null | undefined,
  path: string,
  maximum: number,
): string | null {
  if (value === null || value === undefined) return null;
  return boundedText(value, path, maximum);
}

function normalizedAddress(input: CheckoutAddressInput): CheckoutAddressInput {
  const country = boundedText(input.country, 'shippingAddress.country', 2).toUpperCase();
  if (!/^[A-Z]{2}$/u.test(country))
    throw validation('shippingAddress.country', 'CHECKOUT_COUNTRY_INVALID');
  return {
    fullName: boundedText(input.fullName, 'shippingAddress.fullName', 160),
    phone: boundedText(input.phone, 'shippingAddress.phone', 64),
    country,
    province: boundedText(input.province, 'shippingAddress.province', 120),
    city: boundedText(input.city, 'shippingAddress.city', 120),
    postalCode: boundedText(input.postalCode, 'shippingAddress.postalCode', 32),
    line1: boundedText(input.line1, 'shippingAddress.line1', 240),
    line2: optionalText(input.line2, 'shippingAddress.line2', 240),
  };
}

function normalizeStartInput(input: StartCheckoutInput): StartCheckoutInput {
  const email = boundedText(input.email, 'email', 320).toLowerCase();
  if (!EMAIL.test(email)) throw validation('email', 'CHECKOUT_EMAIL_INVALID');
  if (typeof input.sameAsShipping !== 'boolean') {
    throw validation('sameAsShipping', 'CHECKOUT_BOOLEAN_INVALID');
  }
  const billingAddress =
    input.billingAddress === null ? null : normalizedAddress(input.billingAddress);
  if (!input.sameAsShipping && billingAddress === null) {
    throw validation('billingAddress', 'CHECKOUT_BILLING_ADDRESS_REQUIRED');
  }
  return {
    email,
    phone: optionalText(input.phone, 'phone', 64),
    shippingAddress: normalizedAddress(input.shippingAddress),
    billingAddress,
    sameAsShipping: input.sameAsShipping,
  };
}

function serializeMoney(amountMinor: bigint, currency: string): CheckoutMoney {
  if (amountMinor < 0n) throw new TypeError('Checkout money cannot be negative.');
  return { amountMinor: amountMinor.toString(), currency };
}

function ownerFor(context: NormalizedContext): CheckoutOwner {
  if (context.userId !== null) return { userId: context.userId };
  if (context.anonymousId !== null) return { anonymousId: context.anonymousId };
  throw validation('checkout', 'CHECKOUT_OWNER_REQUIRED');
}

function inventoryActor(context: NormalizedContext): InventoryActorContext {
  return {
    actorUserId: context.userId,
    metadata: {
      requestId: context.requestId,
      ...(context.clientIp === null ? {} : { clientIp: context.clientIp }),
    },
  };
}

function isJsonObject(value: JsonValue | undefined): value is { [key: string]: JsonValue } {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function jsonString(value: JsonValue | undefined): string | null {
  return typeof value === 'string' ? value : null;
}

function moneyFromJson(value: JsonValue | undefined): CheckoutMoney | null {
  if (!isJsonObject(value)) return null;
  const amountMinor = jsonString(value['amountMinor']);
  const currency = jsonString(value['currency']);
  if (amountMinor === null || currency === null || !/^(?:0|[1-9][0-9]*)$/u.test(amountMinor)) {
    return null;
  }
  return { amountMinor, currency };
}

function pricingFromSnapshot(value: JsonValue | null): {
  fingerprint: string;
  pricing: CheckoutPricingProjection;
  shipping: CheckoutShippingProjection;
} | null {
  if (!isJsonObject(value)) return null;
  const fingerprint = jsonString(value['fingerprint']);
  const pricingValue = value['pricing'];
  const shippingValue = value['shipping'];
  if (fingerprint === null || !isJsonObject(pricingValue) || !isJsonObject(shippingValue))
    return null;
  const currency = jsonString(pricingValue['currency']);
  const subtotal = moneyFromJson(pricingValue['subtotal']);
  const discount = moneyFromJson(pricingValue['discount']);
  const merchandiseTotal = moneyFromJson(pricingValue['merchandiseTotal']);
  const tax = moneyFromJson(pricingValue['tax']);
  const total = moneyFromJson(pricingValue['total']);
  const methodCode = jsonString(shippingValue['methodCode']);
  const amount = moneyFromJson(shippingValue['amount']);
  const shippingDiscount = moneyFromJson(shippingValue['discount']);
  const shippingTotal = moneyFromJson(shippingValue['total']);
  const expiresAt = jsonString(shippingValue['expiresAt']);
  if (
    currency === null ||
    subtotal === null ||
    discount === null ||
    merchandiseTotal === null ||
    tax === null ||
    total === null ||
    methodCode !== 'STANDARD' ||
    amount === null ||
    shippingDiscount === null ||
    shippingTotal === null ||
    expiresAt === null
  ) {
    return null;
  }
  return {
    fingerprint,
    pricing: { currency, subtotal, discount, merchandiseTotal, tax, total },
    shipping: {
      methodCode: 'STANDARD',
      amount,
      discount: shippingDiscount,
      total: shippingTotal,
      expiresAt,
    },
  };
}

function addressSnapshot(address: CheckoutAddress): CheckoutJsonObject {
  return {
    fullName: address.fullName,
    phone: address.phone,
    country: address.country,
    province: address.province,
    city: address.city,
    postalCode: address.postalCode,
    line1: address.line1,
    line2: address.line2,
  };
}

function localizedSnapshot(
  values: readonly Readonly<{ locale: string; name: string }>[],
): CheckoutJsonObject {
  return Object.fromEntries(values.map((value) => [value.locale, value.name]));
}

function requestHash(input: StartCheckoutInput): string {
  return createHash('sha256').update(JSON.stringify(input), 'utf8').digest('hex');
}

function confirmationScope(checkoutId: string, owner: CheckoutOwner): string {
  return owner.userId === undefined
    ? `checkout.confirm.anonymous:${owner.anonymousId}:${checkoutId}`
    : `checkout.confirm.user:${owner.userId}:${checkoutId}`;
}

function distributeTax(
  lines: readonly Readonly<{ id: string; amountMinor: bigint }>[],
  totalMinor: bigint,
): ReadonlyMap<string, bigint> {
  if (totalMinor < 0n) throw new TypeError('Tax cannot be negative.');
  const totalWeight = lines.reduce((sum, line) => sum + line.amountMinor, 0n);
  const result = new Map<string, bigint>();
  if (totalWeight === 0n || totalMinor === 0n) {
    for (const line of lines) result.set(line.id, 0n);
    return result;
  }
  const ordered = [...lines].sort((left, right) => left.id.localeCompare(right.id));
  const remainders: readonly Readonly<{ id: string; remainder: bigint }>[] = ordered.map((line) => {
    const numerator = totalMinor * line.amountMinor;
    const base = numerator / totalWeight;
    result.set(line.id, base);
    return { id: line.id, remainder: numerator % totalWeight };
  });
  let undistributed = totalMinor - [...result.values()].reduce((sum, amount) => sum + amount, 0n);
  for (const remainder of [...remainders].sort((left, right) =>
    left.remainder === right.remainder
      ? left.id.localeCompare(right.id)
      : right.remainder > left.remainder
        ? 1
        : -1,
  )) {
    if (undistributed === 0n) break;
    const current = result.get(remainder.id);
    if (current === undefined) throw new Error('Tax allocation is incomplete.');
    result.set(remainder.id, current + 1n);
    undistributed -= 1n;
  }
  if (undistributed !== 0n) throw new Error('Tax allocation did not converge.');
  return result;
}

/**
 * Checkout orchestrates public module services under one database transaction.
 * It owns no cart, pricing, inventory, or order table directly.
 */
export class CheckoutService {
  constructor(
    private readonly repository: CheckoutRepository,
    private readonly cart: CartService,
    private readonly pricing: PricingService,
    private readonly inventory: InventoryService,
    private readonly orders: OrdersService,
    private readonly shipping: CheckoutShippingQuotePort,
    private readonly transactions: TransactionRunner,
  ) {}

  async start(
    contextInput: CheckoutRequestContext,
    input: StartCheckoutInput,
    idempotencyKeyInput: string,
  ): Promise<{ checkout: CheckoutProjection; replayed: boolean }> {
    const context = this.#context(contextInput);
    const contact = normalizeStartInput(input);
    const key = idempotencyKey(idempotencyKeyInput);
    const hash = requestHash(contact);
    await this.cart.prepareForCheckout(context);
    try {
      return await this.transactions.run(async (transaction) => {
        const owner = ownerFor(context);
        const existing = await this.repository.findOwnedByInitiationKey(key, owner, transaction);
        if (existing !== null) {
          const existingHash = this.#initiationHash(existing);
          if (existingHash !== hash) throw validation('idempotencyKey', 'IDEMPOTENCY_KEY_REUSE');
          return { checkout: this.#projection(existing), replayed: true };
        }
        const lockedCart = await this.cart.lockCheckoutCart(context, transaction);
        const now = new Date();
        const provisionalExpiry = new Date(now.getTime() + 15 * 60 * 1_000);
        const session = await this.repository.createSession(
          {
            id: randomUUID(),
            cartId: lockedCart.cart.id,
            userId: context.userId,
            idempotencyKey: key,
            contact,
            reservationExpiresAt: provisionalExpiry,
            pricingSnapshot: { version: 1, initiationRequestHash: hash },
            actorUserId: context.userId,
            requestId: context.requestId,
            clientIp: context.clientIp,
          },
          transaction,
        );
        const priced = await this.#price(
          lockedCart.lines,
          lockedCart.cart,
          session,
          context,
          transaction,
          now,
        );
        const reservation = await this.inventory.acquireReservations(
          {
            checkoutSessionId: session.id,
            cartId: lockedCart.cart.id,
            lines: lockedCart.lines.map((line) => ({
              variantId: line.variantId,
              quantity: line.quantity,
            })),
            actor: inventoryActor(context),
            now,
          },
          transaction,
        );
        const selected = await this.shipping.selectForCheckout({
          checkoutSessionId: session.id,
          checkoutCurrency: lockedCart.cart.currency,
          expiresAt: reservation.expiresAt,
          actorUserId: context.userId,
          freeShippingApplies: this.#freeShipping(priced),
          transaction,
        });
        const snapshot = this.#snapshot(priced, selected.quote, selected.charge, hash);
        const updated = await this.repository.updatePricingSnapshot(
          session.id,
          {
            reservationExpiresAt: reservation.expiresAt,
            pricingSnapshot: snapshot.value,
            actorUserId: context.userId,
          },
          transaction,
        );
        return { checkout: this.#projection(updated), replayed: false };
      });
    } catch (error) {
      if (this.#isUniqueConstraint(error)) {
        const replay = await this.transactions.run((transaction) =>
          this.repository.findOwnedByInitiationKey(key, ownerFor(context), transaction),
        );
        if (replay !== null && this.#initiationHash(replay) === hash) {
          return { checkout: this.#projection(replay), replayed: true };
        }
        throw new ConflictAppError({ code: 'IDEMPOTENCY_KEY_REUSE' });
      }
      throw error;
    }
  }

  async get(
    contextInput: CheckoutRequestContext,
    checkoutIdInput: string,
  ): Promise<CheckoutProjection> {
    const context = this.#context(contextInput);
    const checkoutId = uuid(checkoutIdInput, 'checkoutId');
    const session = await this.transactions.run(async (transaction) => {
      const locked = await this.repository.lockOwnedSession(
        checkoutId,
        ownerFor(context),
        transaction,
      );
      if (locked === null) throw new NotFoundAppError();
      if (
        locked.status === 'OPEN' &&
        locked.reservationExpiresAt !== null &&
        locked.reservationExpiresAt.getTime() <= Date.now()
      ) {
        await this.inventory.releaseReservations(
          {
            checkoutSessionId: locked.id,
            reason: 'checkout_expired',
            actor: inventoryActor(context),
          },
          transaction,
        );
        await this.repository.markExpired(locked.id, context.userId, transaction);
        const expired = await this.repository.lockOwnedSession(
          checkoutId,
          ownerFor(context),
          transaction,
        );
        if (expired === null) throw new NotFoundAppError();
        return expired;
      }
      return locked;
    });
    return this.#projection(session);
  }

  /**
   * Explicit checkout re-entry hold extension (domain-model.md §7): the
   * customer returned to an in-progress checkout with an active reservation.
   * This is a deliberate, dedicated operation rather than a side effect of
   * every `get()` poll, so simply refreshing the checkout page can never
   * extend stock indefinitely. `InventoryService.extendReservationsOnce` is
   * itself idempotent and self-limiting to one real extension (15 -> 30
   * minutes measured from the original reservation, never further), so
   * calling this endpoint more than once is safe and a no-op after the first
   * successful extension — the browser's countdown is advisory only; the
   * stored `reservationExpiresAt` the server returns is authoritative.
   */
  async extend(
    contextInput: CheckoutRequestContext,
    checkoutIdInput: string,
  ): Promise<CheckoutProjection> {
    const context = this.#context(contextInput);
    const checkoutId = uuid(checkoutIdInput, 'checkoutId');
    // Every branch below returns a value instead of throwing, so that any
    // release/expiry write it made is part of the transaction that commits.
    // Domain-error branches are translated to a thrown error only after the
    // transaction has already committed — throwing from inside `run()` would
    // roll back the very expiry-marking write the branch just made.
    const outcome = await this.transactions.run(async (transaction) => {
      const owner = ownerFor(context);
      const locked = await this.repository.lockOwnedSession(checkoutId, owner, transaction);
      if (locked === null) return { state: 'NOT_FOUND' as const };
      if (locked.status !== 'OPEN' || locked.reservationExpiresAt === null) {
        return { state: 'NOT_EXTENDABLE' as const };
      }
      const now = new Date();
      if (locked.reservationExpiresAt.getTime() <= now.getTime()) {
        await this.inventory.releaseReservations(
          {
            checkoutSessionId: locked.id,
            reason: 'checkout_expired',
            actor: inventoryActor(context),
          },
          transaction,
        );
        await this.repository.markExpired(locked.id, context.userId, transaction);
        return { state: 'EXPIRED' as const };
      }
      const extension = await this.inventory.extendReservationsOnce(
        { checkoutSessionId: locked.id, actor: inventoryActor(context), now },
        transaction,
      );
      if (extension.expiresAt === null) return { state: 'NOT_ACTIVE' as const };
      if (extension.expiresAt.getTime() === locked.reservationExpiresAt.getTime()) {
        // Already extended once (or nothing to extend) — return the current
        // state unchanged rather than writing an identical timestamp again.
        return { state: 'EXTENDED' as const, session: locked };
      }
      const updated = await this.repository.extendReservationExpiry(
        locked.id,
        { reservationExpiresAt: extension.expiresAt, actorUserId: context.userId },
        transaction,
      );
      return { state: 'EXTENDED' as const, session: updated };
    });
    switch (outcome.state) {
      case 'NOT_FOUND':
        throw new NotFoundAppError();
      case 'NOT_EXTENDABLE':
        throw new ConflictAppError({ code: 'CHECKOUT_NOT_EXTENDABLE' });
      case 'EXPIRED':
        throw new ConflictAppError({ code: 'RESERVATION_EXPIRED' });
      case 'NOT_ACTIVE':
        throw new ConflictAppError({ code: 'RESERVATION_NOT_ACTIVE' });
      case 'EXTENDED':
        return this.#projection(outcome.session);
    }
  }

  async confirm(
    contextInput: CheckoutRequestContext,
    checkoutIdInput: string,
    idempotencyKeyInput: string,
  ): Promise<CheckoutConfirmationResult> {
    const context = this.#context(contextInput);
    const checkoutId = uuid(checkoutIdInput, 'checkoutId');
    const key = idempotencyKey(idempotencyKeyInput);
    const outcome = await this.transactions.run(async (transaction) => {
      const owner = ownerFor(context);
      const session = await this.repository.lockOwnedSession(checkoutId, owner, transaction);
      if (session === null) throw new NotFoundAppError();
      const scope = confirmationScope(session.id, owner);
      const claim = await this.repository.claimConfirmationIdempotency(
        {
          key,
          scope,
          userId: context.userId,
          requestHash: createHash('sha256').update(`${session.id}:confirm`, 'utf8').digest('hex'),
          expiresAt: new Date(Date.now() + CONFIRMATION_IDEMPOTENCY_TTL_MS),
        },
        transaction,
      );
      if (claim !== null) {
        if (claim.completedOrderNumber !== null) {
          return {
            state: 'CONFIRMED' as const,
            session,
            orderNumber: claim.completedOrderNumber,
            replayed: true,
          };
        }
        if (
          claim.requestHash !==
          createHash('sha256').update(`${session.id}:confirm`, 'utf8').digest('hex')
        ) {
          throw validation('idempotencyKey', 'IDEMPOTENCY_KEY_REUSE');
        }
        throw new ConflictAppError({ code: 'IDEMPOTENCY_KEY_IN_PROGRESS' });
      }
      const existingOrder = await this.orders.findByCheckoutSession(session.id, transaction);
      if (existingOrder !== null) {
        await this.repository.completeConfirmationIdempotency(
          { key, scope, orderNumber: existingOrder.number },
          transaction,
        );
        return {
          state: 'CONFIRMED' as const,
          session,
          orderNumber: existingOrder.number,
          replayed: true,
        };
      }
      if (session.status !== 'OPEN')
        throw new ConflictAppError({ code: 'CHECKOUT_NOT_CONFIRMABLE' });
      if (
        session.reservationExpiresAt === null ||
        session.reservationExpiresAt.getTime() <= Date.now()
      ) {
        throw new ConflictAppError({ code: 'RESERVATION_EXPIRED' });
      }
      const lockedCart = await this.cart.lockCheckoutCart(context, transaction);
      if (lockedCart.cart.id !== session.cartId)
        throw new ConflictAppError({ code: 'CHECKOUT_CART_CHANGED' });
      const now = new Date();
      const priced = await this.#price(
        lockedCart.lines,
        lockedCart.cart,
        session,
        context,
        transaction,
        now,
      );
      const requoted = await this.shipping.revalidateForConfirmation({
        checkoutSessionId: session.id,
        checkoutCurrency: lockedCart.cart.currency,
        expiresAt: session.reservationExpiresAt,
        actorUserId: context.userId,
        freeShippingApplies: this.#freeShipping(priced),
        transaction,
      });
      const snapshot = this.#snapshot(
        priced,
        requoted.quote,
        requoted.charge,
        this.#initiationHash(session),
      );
      const previous = pricingFromSnapshot(session.pricingSnapshot);
      if (previous === null || previous.fingerprint !== snapshot.fingerprint) {
        const updated = await this.repository.updatePricingSnapshot(
          session.id,
          {
            reservationExpiresAt: session.reservationExpiresAt,
            pricingSnapshot: snapshot.value,
            actorUserId: context.userId,
          },
          transaction,
        );
        return { state: 'PRICE_CHANGED' as const, session: updated };
      }
      await this.inventory.assertActiveReservations(
        {
          checkoutSessionId: session.id,
          lines: lockedCart.lines.map((line) => ({
            variantId: line.variantId,
            quantity: line.quantity,
          })),
          actor: inventoryActor(context),
          now,
        },
        transaction,
      );
      const shippingAddress = session.shippingAddress;
      const billingAddress = session.billingAddress;
      if (shippingAddress === null || billingAddress === null) {
        throw new ConflictAppError({ code: 'CHECKOUT_ADDRESS_MISSING' });
      }
      if (priced.tax.state !== 'RESOLVED') {
        throw new DependencyUnavailableAppError({
          code: 'CHECKOUT_TAX_CONFIGURATION_UNAVAILABLE',
          retryable: false,
        });
      }
      if (priced.tax.rate.isInclusive) {
        // `order_line` requires `line_total_minor = unit_price_minor * quantity
        // - discount_allocated_minor + tax_amount_minor` (immutable migration
        // constraint). That formula only reconstructs a correct, non-double
        // -counted gross line total when the stored unit price is tax
        // -exclusive. No tax-inclusive rate is configured anywhere in this
        // codebase today; failing closed here avoids ever persisting an
        // order line whose stored total silently double-counts tax instead
        // of quietly writing an incorrect customer-facing invoice.
        throw new DependencyUnavailableAppError({
          code: 'CHECKOUT_INCLUSIVE_TAX_UNSUPPORTED',
          retryable: false,
        });
      }
      const taxRateBps = priced.tax.rate.rateBps;
      const taxByLine = distributeTax(
        priced.lines.map((line) => ({ id: line.id, amountMinor: line.lineTotalMinor })),
        priced.tax.taxAmountMinor,
      );
      const order = await this.orders.createPendingOrder(
        {
          checkoutSessionId: session.id,
          userId: context.userId,
          email: session.email,
          phone: session.phone,
          localeAtPurchase: lockedCart.cart.locale,
          currency: priced.currency,
          subtotalMinor: priced.subtotalMinor,
          discountTotalMinor: priced.discountTotalMinor,
          shippingTotalMinor: requoted.charge.totalMinor,
          taxTotalMinor: priced.tax.taxAmountMinor,
          taxInclusive: priced.tax.rate.isInclusive,
          grandTotalMinor: snapshot.grandTotalMinor,
          couponCodeSnapshot: priced.coupon?.code ?? null,
          shippingMethodSnapshot: {
            code: requoted.quote.methodCode,
            quotedAmountMinor: requoted.quote.amountMinor.toString(),
            discountMinor: requoted.charge.discountMinor.toString(),
            totalMinor: requoted.charge.totalMinor.toString(),
            currency: requoted.quote.currency,
            taxInclusive: priced.tax.rate.isInclusive,
          },
          shippingAddressSnapshot: addressSnapshot(shippingAddress),
          billingAddressSnapshot: addressSnapshot(billingAddress),
          placedAt: now,
          actorUserId: context.userId,
          lines: lockedCart.lines.map((line) => {
            const price = priced.lines.find((candidate) => candidate.id === line.id);
            const taxAmountMinor = taxByLine.get(line.id);
            if (price === undefined || taxAmountMinor === undefined) {
              throw new Error('Checkout line pricing is incomplete.');
            }
            return {
              productId: line.product.productId,
              variantId: line.variantId,
              skuSnapshot: line.product.sku,
              productNameSnapshot: localizedSnapshot(line.product.productNames),
              variantNameSnapshot: localizedSnapshot(line.product.variantNames),
              attributesSnapshot: {
                netWeightGrams: line.product.netWeightGrams,
                jarSizeLabelKey: line.product.jarSizeLabelKey,
                packagingTypeKey: line.product.packagingTypeKey,
              },
              imageUrlSnapshot: null,
              quantity: line.quantity,
              unitPriceMinor: price.unitPriceMinor,
              discountAllocatedMinor: price.discountMinor,
              taxRateBps,
              taxAmountMinor,
              // `order_line_values` requires the stored gross total to equal
              // unitPrice*quantity - discount + tax; tax is exclusive here
              // (guarded above), so the net merchandise line total plus this
              // line's apportioned tax is the correct gross figure.
              lineTotalMinor: price.lineTotalMinor + taxAmountMinor,
              harvestBatchCodeSnapshot: null,
            };
          }),
        },
        transaction,
      );
      await this.pricing.redeemCheckoutCoupon({
        coupon: priced.coupon,
        userId: context.userId,
        orderId: order.id,
        amountMinor: priced.discountTotalMinor + requoted.charge.discountMinor,
        actorUserId: context.userId,
        transaction,
      });
      await this.inventory.consumeReservations(
        { checkoutSessionId: session.id, orderId: order.id, actor: inventoryActor(context), now },
        transaction,
      );
      await this.cart.convertCheckoutCart(context, lockedCart.cart.id, transaction);
      await this.repository.markAwaitingPayment(session.id, context.userId, now, transaction);
      await this.repository.completeConfirmationIdempotency(
        { key, scope, orderNumber: order.number },
        transaction,
      );
      const completed = await this.repository.lockOwnedSession(session.id, owner, transaction);
      if (completed === null) throw new NotFoundAppError();
      return {
        state: 'CONFIRMED' as const,
        session: completed,
        orderNumber: order.number,
        replayed: false,
      };
    });
    return outcome.state === 'PRICE_CHANGED'
      ? { state: 'PRICE_CHANGED', checkout: this.#projection(outcome.session) }
      : {
          state: 'CONFIRMED',
          checkout: this.#projection(outcome.session),
          orderNumber: outcome.orderNumber,
          replayed: outcome.replayed,
        };
  }

  async #price(
    lines: readonly CheckoutCartLineRecord[],
    cart: Readonly<{ currency: string; couponCode: string | null }>,
    session: CheckoutSessionRecord,
    context: NormalizedContext,
    transaction: TransactionContext,
    now: Date,
  ): Promise<CheckoutPricingResult> {
    const shippingAddress = session.shippingAddress;
    if (shippingAddress === null) throw new ConflictAppError({ code: 'CHECKOUT_ADDRESS_MISSING' });
    const priced = await this.pricing.priceCheckout({
      currency: cart.currency,
      lines: lines.map((line) => ({
        id: line.id,
        variantId: line.variantId,
        quantity: line.quantity,
        published: line.product.published,
        categoryIds: line.product.categoryIds,
        collectionIds: line.product.collectionIds,
      })),
      couponCode: cart.couponCode,
      userId: context.userId,
      jurisdiction: { country: shippingAddress.country, region: shippingAddress.province },
      now,
      transaction,
    });
    if (priced.tax.state !== 'RESOLVED') {
      throw new DependencyUnavailableAppError({
        code: 'CHECKOUT_TAX_CONFIGURATION_UNAVAILABLE',
        retryable: false,
      });
    }
    return priced;
  }

  #freeShipping(priced: CheckoutPricingResult): boolean {
    return (
      priced.couponEvaluation?.eligible === true &&
      priced.couponEvaluation.effect.shippingEffect === 'DEFERRED'
    );
  }

  #snapshot(
    priced: CheckoutPricingResult,
    quote: StandardShippingQuote,
    charge: StandardShippingCharge,
    initiationRequestHash: string,
  ): SnapshotBuild {
    if (priced.tax.state !== 'RESOLVED')
      throw new Error('Resolved tax is required for a checkout snapshot.');
    const taxTotalMinor = priced.tax.taxAmountMinor;
    const grandTotalMinor = priced.tax.rate.isInclusive
      ? priced.merchandiseTotalMinor + charge.totalMinor
      : priced.merchandiseTotalMinor + charge.totalMinor + taxTotalMinor;
    const projection: CheckoutPricingProjection = {
      currency: priced.currency,
      subtotal: serializeMoney(priced.subtotalMinor, priced.currency),
      discount: serializeMoney(priced.discountTotalMinor, priced.currency),
      merchandiseTotal: serializeMoney(priced.merchandiseTotalMinor, priced.currency),
      tax: serializeMoney(taxTotalMinor, priced.currency),
      total: serializeMoney(grandTotalMinor, priced.currency),
    };
    const shipping: CheckoutShippingProjection = {
      methodCode: 'STANDARD',
      amount: serializeMoney(charge.quotedAmountMinor, charge.currency),
      discount: serializeMoney(charge.discountMinor, charge.currency),
      total: serializeMoney(charge.totalMinor, charge.currency),
      expiresAt: quote.expiresAt.toISOString(),
    };
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          currency: priced.currency,
          lines: [...priced.lines]
            .sort((left, right) => left.id.localeCompare(right.id))
            .map((line) => ({
              id: line.id,
              quantity: line.quantity,
              unitPriceMinor: line.unitPriceMinor.toString(),
              discountMinor: line.discountMinor.toString(),
              lineTotalMinor: line.lineTotalMinor.toString(),
            })),
          couponId: priced.coupon?.id ?? null,
          couponType: priced.couponEvaluation?.effect?.type ?? null,
          taxCode: priced.tax.rate.code,
          taxRateBps: priced.tax.rate.rateBps,
          taxInclusive: priced.tax.rate.isInclusive,
          shippingAmountMinor: charge.quotedAmountMinor.toString(),
          shippingDiscountMinor: charge.discountMinor.toString(),
          shippingTotalMinor: charge.totalMinor.toString(),
          shippingCurrency: charge.currency,
        }),
        'utf8',
      )
      .digest('hex');
    return {
      fingerprint,
      projection,
      shipping,
      grandTotalMinor,
      value: {
        version: 1,
        initiationRequestHash,
        fingerprint,
        pricing: {
          currency: projection.currency,
          subtotal: projection.subtotal,
          discount: projection.discount,
          merchandiseTotal: projection.merchandiseTotal,
          tax: projection.tax,
          total: projection.total,
        },
        shipping: {
          methodCode: shipping.methodCode,
          amount: shipping.amount,
          discount: shipping.discount,
          total: shipping.total,
          expiresAt: shipping.expiresAt,
        },
      },
    };
  }

  #projection(session: CheckoutSessionRecord): CheckoutProjection {
    const snapshot = pricingFromSnapshot(session.pricingSnapshot);
    return {
      id: session.id,
      status: session.status,
      email: session.email,
      phone: session.phone,
      shippingAddress: session.shippingAddress,
      billingAddress: session.billingAddress,
      sameAsShipping: session.sameAsShipping,
      shippingQuote: snapshot?.shipping ?? null,
      reservationExpiresAt:
        session.reservationExpiresAt === null ? null : session.reservationExpiresAt.toISOString(),
      pricing: snapshot?.pricing ?? null,
    };
  }

  #initiationHash(session: CheckoutSessionRecord): string {
    if (!isJsonObject(session.pricingSnapshot)) return '';
    return jsonString(session.pricingSnapshot['initiationRequestHash']) ?? '';
  }

  #context(input: CheckoutRequestContext): NormalizedContext {
    const userId = input.userId === null ? null : uuid(input.userId, 'userId');
    const anonymousId = input.anonymousId === null ? null : uuid(input.anonymousId, 'anonymousId');
    if (userId === null && anonymousId === null)
      throw validation('checkout', 'CHECKOUT_OWNER_REQUIRED');
    return {
      userId,
      anonymousId,
      locale: boundedText(input.locale, 'locale', 16),
      currency: boundedText(input.currency, 'currency', 3).toUpperCase(),
      requestId: boundedText(input.requestId, 'requestId', 128),
      clientIp: input.clientIp,
    };
  }

  #isUniqueConstraint(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
  }
}
