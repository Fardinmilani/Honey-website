import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { createPrismaClient, type PrismaClient } from '@honey/db';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CartService,
  type CartRequestContext,
} from '../src/modules/cart/application/cart.service.js';
import { InventoryCartAvailabilityAdapter } from '../src/modules/cart/infrastructure/inventory-cart-availability.adapter.js';
import { PricingCartAdapter } from '../src/modules/cart/infrastructure/pricing-cart.adapter.js';
import { PrismaCartRepository } from '../src/modules/cart/infrastructure/prisma-cart.repository.js';
import type { CheckoutRequestContext } from '../src/modules/checkout/application/checkout.service.js';
import { CheckoutService } from '../src/modules/checkout/application/checkout.service.js';
import type {
  StartCheckoutInput,
  CheckoutAddressInput,
} from '../src/modules/checkout/domain/checkout.js';
import { PrismaCheckoutRepository } from '../src/modules/checkout/infrastructure/prisma-checkout.repository.js';
import { StandardShippingQuoteService } from '../src/modules/checkout/shipping/application/standard-shipping-quote.service.js';
import { PrismaCheckoutShippingQuoteRepository } from '../src/modules/checkout/shipping/infrastructure/prisma-checkout-shipping-quote.repository.js';
import { InventoryService } from '../src/modules/inventory/application/inventory.service.js';
import { PrismaInventoryRepository } from '../src/modules/inventory/infrastructure/prisma-inventory.repository.js';
import { OrdersService } from '../src/modules/orders/application/orders.service.js';
import { PrismaOrdersRepository } from '../src/modules/orders/infrastructure/prisma-orders.repository.js';
import { PricingService } from '../src/modules/pricing/application/pricing.service.js';
import { PrismaPricingRepository } from '../src/modules/pricing/infrastructure/prisma-pricing.repository.js';
import { PrismaPlatformAdapter } from '../src/platform/infrastructure/prisma-platform.adapter.js';
import type { AuthenticatedPrincipal } from '../src/modules/identity/domain/identity.js';

const execFileAsync = promisify(execFile);
const dbDirectory = fileURLToPath(new URL('../../db/', import.meta.url));
const prismaCli = fileURLToPath(
  new URL('../../db/node_modules/prisma/build/index.js', import.meta.url),
);

type TemporaryDatabase = Readonly<{ adminUrl: string; databaseName: string; databaseUrl: string }>;

const cartConfig = {
  activeTtlMs: 30 * 24 * 60 * 60 * 1000,
  maximumLineQuantity: 20,
  defaultCurrency: 'IRR',
  enabledCurrencies: ['IRR'],
} as const;

function cartContext(anonymousId: string, userId: string | null = null): CartRequestContext {
  return { anonymousId, userId, locale: 'en', currency: 'IRR' };
}

function checkoutContext(
  anonymousId: string | null,
  userId: string | null = null,
  requestId = randomUUID(),
): CheckoutRequestContext {
  return { anonymousId, userId, locale: 'en', currency: 'IRR', requestId, clientIp: '127.0.0.1' };
}

function address(overrides: Partial<CheckoutAddressInput> = {}): CheckoutAddressInput {
  return {
    fullName: 'Phase Thirteen Customer',
    phone: '+989120000000',
    country: 'US',
    province: 'Isfahan',
    city: 'Isfahan',
    postalCode: '81647',
    line1: '1 Saffron Alley',
    line2: null,
    ...overrides,
  };
}

function startInput(overrides: Partial<StartCheckoutInput> = {}): StartCheckoutInput {
  return {
    email: `phase13-${randomUUID()}@example.invalid`,
    phone: null,
    shippingAddress: address(),
    billingAddress: null,
    sameAsShipping: true,
    ...overrides,
  };
}

function staffPrincipal(
  permissions: readonly ('inventory:read' | 'inventory:adjust')[],
): AuthenticatedPrincipal {
  return { userId: randomUUID(), sessionId: randomUUID(), kind: 'STAFF', permissions };
}

async function createTemporaryDatabase(): Promise<TemporaryDatabase> {
  const base = new URL(
    process.env['DATABASE_URL'] ??
      'postgresql://honey_local:replace-with-local-development-password@127.0.0.1:5432/honey_local',
  );
  const databaseName = `honey_phase13_${randomUUID().replaceAll('-', '')}`;
  if (!/^honey_phase13_[a-f0-9]{32}$/u.test(databaseName)) throw new Error('Unsafe database name.');
  const admin = new URL(base);
  admin.pathname = '/postgres';
  const target = new URL(base);
  target.pathname = `/${databaseName}`;
  const client = new Client({
    connectionString: admin.toString(),
    connectionTimeoutMillis: 10_000,
  });
  await client.connect();
  try {
    await client.query(`CREATE DATABASE "${databaseName}" TEMPLATE template0`);
  } finally {
    await client.end();
  }
  return { adminUrl: admin.toString(), databaseName, databaseUrl: target.toString() };
}

async function migrate(databaseUrl: string): Promise<void> {
  await execFileAsync(
    process.execPath,
    [prismaCli, 'migrate', 'deploy', '--config', 'prisma.config.ts'],
    {
      cwd: dbDirectory,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      windowsHide: true,
      timeout: 120_000,
    },
  );
}

async function dropTemporaryDatabase(database: TemporaryDatabase): Promise<void> {
  const client = new Client({
    connectionString: database.adminUrl,
    connectionTimeoutMillis: 10_000,
  });
  await client.connect();
  try {
    await client.query(`DROP DATABASE "${database.databaseName}" WITH (FORCE)`);
  } finally {
    await client.end();
  }
}

describe('Phase 13 checkout, reservations, and orders on PostgreSQL', () => {
  let database: TemporaryDatabase;
  let prisma: PrismaClient;
  let cartRepository: PrismaCartRepository;
  let inventoryRepository: PrismaInventoryRepository;
  let pricingRepository: PrismaPricingRepository;
  let checkoutRepository: PrismaCheckoutRepository;
  let shippingRepository: PrismaCheckoutShippingQuoteRepository;
  let ordersRepository: PrismaOrdersRepository;
  let platform: PrismaPlatformAdapter;
  let cart: CartService;
  let inventory: InventoryService;
  let pricing: PricingService;
  let orders: OrdersService;
  let checkout: CheckoutService;

  let defaultLocationId = '';
  let secondLocationId = '';

  /**
   * Every test provisions its own product/variant so that reservation,
   * ledger, and reconciliation assertions can never bleed across tests that
   * run in the same shared database.
   */
  async function seedVariant(onHand: number, secondOnHand = 0): Promise<string> {
    const productId = randomUUID();
    await prisma.product.create({
      data: {
        id: productId,
        sku: `PHASE13-P-${randomUUID()}`,
        sourcingType: 'OWN_PRODUCTION',
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
    });
    const variantId = randomUUID();
    await prisma.productVariant.create({
      data: {
        id: variantId,
        productId,
        sku: `PHASE13-V-${randomUUID()}`,
        status: 'PUBLISHED',
        netWeightGrams: 450,
        jarSizeLabelKey: 'jar.450g',
        packagingTypeKey: 'packaging.glass',
        weightGramsShipping: 700,
        dimensionsMm: [85, 85, 120],
        isDefault: true,
      },
    });
    await prisma.productTranslation.create({
      data: {
        id: randomUUID(),
        productId,
        locale: 'en',
        name: 'Phase thirteen honey',
        slug: `phase-13-${randomUUID()}`,
      },
    });
    await prisma.variantTranslation.create({
      data: { id: randomUUID(), variantId, locale: 'en', name: '450 g jar' },
    });
    await prisma.inventoryItem.create({
      data: {
        id: randomUUID(),
        variantId,
        stockLocationId: defaultLocationId,
        onHand,
        reserved: 0,
        allocated: 0,
      },
    });
    await prisma.inventoryItem.create({
      data: {
        id: randomUUID(),
        variantId,
        stockLocationId: secondLocationId,
        onHand: secondOnHand,
        reserved: 0,
        allocated: 0,
      },
    });
    await prisma.variantPrice.create({
      data: {
        id: randomUUID(),
        variantId,
        currency: 'IRR',
        amountMinor: 1_000n,
        validFrom: new Date(Date.now() - 60 * 60 * 1000),
        validTo: null,
      },
    });
    return variantId;
  }

  /**
   * A minimal, real CheckoutSession row (no pricing/shipping/reservation)
   * purely so direct `InventoryService` calls that require a
   * `checkoutSessionId` satisfy the foreign key without going through the
   * full checkout flow.
   */
  async function seedBareCheckoutSession(): Promise<string> {
    const anonymousId = randomUUID();
    const cartRecord = await cart.getCart(cartContext(anonymousId));
    const id = randomUUID();
    await prisma.checkoutSession.create({
      data: {
        id,
        cartId: cartRecord.id,
        email: `phase13-bare-${randomUUID()}@example.invalid`,
        sameAsShipping: true,
        idempotencyKey: `bare-${randomUUID()}`,
      },
    });
    return id;
  }

  async function newCheckout(
    variantId: string,
    anonymousId: string,
    quantity: number,
    inputOverrides: Partial<StartCheckoutInput> = {},
  ): ReturnType<CheckoutService['start']> {
    await cart.addLine(cartContext(anonymousId), { variantId, quantity });
    return checkout.start(
      checkoutContext(anonymousId),
      startInput(inputOverrides),
      `start-${randomUUID()}`,
    );
  }

  beforeAll(async () => {
    database = await createTemporaryDatabase();
    await migrate(database.databaseUrl);
    prisma = createPrismaClient({ databaseUrl: database.databaseUrl });

    cartRepository = new PrismaCartRepository(database.databaseUrl);
    inventoryRepository = new PrismaInventoryRepository(database.databaseUrl);
    pricingRepository = new PrismaPricingRepository(database.databaseUrl);
    checkoutRepository = new PrismaCheckoutRepository(database.databaseUrl);
    shippingRepository = new PrismaCheckoutShippingQuoteRepository(database.databaseUrl);
    ordersRepository = new PrismaOrdersRepository(database.databaseUrl);
    platform = new PrismaPlatformAdapter(database.databaseUrl);

    inventory = new InventoryService(inventoryRepository);
    pricing = new PricingService(pricingRepository, { enabledCurrencies: ['IRR'] });
    orders = new OrdersService(ordersRepository);
    cart = new CartService(
      cartRepository,
      new InventoryCartAvailabilityAdapter(inventory),
      new PricingCartAdapter(pricing),
      cartConfig,
    );
    const shipping = new StandardShippingQuoteService(shippingRepository, {
      state: 'CONFIGURED',
      amountMinor: 5_00n,
      currency: 'IRR',
    });
    checkout = new CheckoutService(
      checkoutRepository,
      cart,
      pricing,
      inventory,
      orders,
      shipping,
      platform,
    );

    defaultLocationId = randomUUID();
    secondLocationId = randomUUID();
    await prisma.stockLocation.create({
      data: {
        id: defaultLocationId,
        code: 'PHASE13-WH-A',
        name: 'Phase 13 warehouse A',
        type: 'WAREHOUSE',
        isSellable: true,
        isDefault: true,
      },
    });
    await prisma.stockLocation.create({
      data: {
        id: secondLocationId,
        code: 'PHASE13-WH-B',
        name: 'Phase 13 warehouse B',
        type: 'WAREHOUSE',
        isSellable: true,
        isDefault: false,
      },
    });
    await prisma.taxRate.create({
      data: {
        id: randomUUID(),
        code: 'PHASE13-US',
        name: 'Phase 13 US rate',
        rateBps: 900,
        country: 'US',
        region: null,
        isInclusive: false,
        isActive: true,
      },
    });
  }, 120_000);

  afterAll(async () => {
    await cartRepository?.close();
    await inventoryRepository?.close();
    await pricingRepository?.close();
    await checkoutRepository?.close();
    await shippingRepository?.close();
    await ordersRepository?.close();
    await platform?.close();
    await prisma?.$disconnect();
    if (database !== undefined) await dropTemporaryDatabase(database);
  });

  describe('checkout start, empty cart, and unavailable stock', () => {
    it('rejects starting checkout from an empty cart without creating a session', async () => {
      const anonymousId = randomUUID();
      await cart.getCart(cartContext(anonymousId));
      const before = await prisma.checkoutSession.count();
      await expect(
        checkout.start(checkoutContext(anonymousId), startInput(), `start-${randomUUID()}`),
      ).rejects.toMatchObject({
        code: 'VALIDATION_FAILED',
        errors: [{ path: 'cart', code: 'CHECKOUT_CART_EMPTY' }],
      });
      expect(await prisma.checkoutSession.count()).toBe(before);
    });

    it('re-verifies availability at checkout time and rejects an unavailable variant without reserving anything', async () => {
      const variantId = await seedVariant(100, 0);
      const anonymousId = randomUUID();
      await cart.addLine(cartContext(anonymousId), { variantId, quantity: 2 });
      // Stock dropped to zero after the item was added to the cart but before checkout started.
      await prisma.inventoryItem.update({
        where: { variantId_stockLocationId: { variantId, stockLocationId: defaultLocationId } },
        data: { onHand: 0 },
      });
      await expect(
        checkout.start(checkoutContext(anonymousId), startInput(), `start-${randomUUID()}`),
      ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
      expect(await prisma.stockReservation.count({ where: { variantId } })).toBe(0);
    });
  });

  describe('reservation hold lifecycle (15 -> 30 minute extension, never revived, never oversells)', () => {
    it('creates a 15-minute initial reservation hold on checkout start', async () => {
      const variantId = await seedVariant(100, 0);
      const anonymousId = randomUUID();
      const started = new Date();
      const { checkout: projection } = await newCheckout(variantId, anonymousId, 1);
      expect(projection.reservationExpiresAt).not.toBeNull();
      const expiresAt = new Date(projection.reservationExpiresAt as string);
      const deltaMs = expiresAt.getTime() - started.getTime();
      expect(deltaMs).toBeGreaterThan(14 * 60 * 1000);
      expect(deltaMs).toBeLessThanOrEqual(15 * 60 * 1000 + 5_000);
      const reservation = await prisma.stockReservation.findFirstOrThrow({
        where: { variantId, checkoutSessionId: projection.id },
      });
      expect(reservation.status).toBe('ACTIVE');
      expect(reservation.expiresAt.getTime()).toBe(expiresAt.getTime());
    });

    it('extends the hold exactly once toward the 30-minute maximum and is a no-op afterward', async () => {
      const variantId = await seedVariant(100, 0);
      const anonymousId = randomUUID();
      const { checkout: initial } = await newCheckout(variantId, anonymousId, 1);
      const reservationBefore = await prisma.stockReservation.findFirstOrThrow({
        where: { checkoutSessionId: initial.id },
      });
      const createdAt = reservationBefore.createdAt;

      const extendedOnce = await checkout.extend(checkoutContext(anonymousId), initial.id);
      const firstExpiry = new Date(extendedOnce.reservationExpiresAt as string);
      expect(firstExpiry.getTime()).toBeGreaterThan(
        new Date(initial.reservationExpiresAt as string).getTime(),
      );
      expect(firstExpiry.getTime()).toBe(createdAt.getTime() + 30 * 60 * 1000);

      const extendedTwice = await checkout.extend(checkoutContext(anonymousId), initial.id);
      expect(extendedTwice.reservationExpiresAt).toBe(extendedOnce.reservationExpiresAt);

      const totalHoldMs = firstExpiry.getTime() - createdAt.getTime();
      expect(totalHoldMs).toBeLessThanOrEqual(30 * 60 * 1000);
    });

    it('does not extend or revive a reservation whose hold has already elapsed', async () => {
      const variantId = await seedVariant(100, 0);
      const anonymousId = randomUUID();
      const { checkout: initial } = await newCheckout(variantId, anonymousId, 1);
      const past = new Date(Date.now() - 60 * 1000);
      await prisma.checkoutSession.update({
        where: { id: initial.id },
        data: { reservationExpiresAt: past },
      });
      await prisma.stockReservation.updateMany({
        where: { checkoutSessionId: initial.id },
        data: { expiresAt: past },
      });

      await expect(checkout.extend(checkoutContext(anonymousId), initial.id)).rejects.toMatchObject(
        {
          code: 'RESERVATION_EXPIRED',
        },
      );
      const session = await prisma.checkoutSession.findUniqueOrThrow({ where: { id: initial.id } });
      expect(session.status).toBe('EXPIRED');
      const reservations = await prisma.stockReservation.findMany({
        where: { checkoutSessionId: initial.id },
      });
      expect(reservations.every((row) => row.status === 'EXPIRED')).toBe(true);

      // Calling extend again must not revive it.
      await expect(checkout.extend(checkoutContext(anonymousId), initial.id)).rejects.toMatchObject(
        {
          code: 'CHECKOUT_NOT_EXTENDABLE',
        },
      );
    });

    it('does not extend a reservation that was already consumed by a completed order', async () => {
      const variantId = await seedVariant(100, 0);
      const anonymousId = randomUUID();
      const { checkout: initial } = await newCheckout(variantId, anonymousId, 1);
      const confirmed = await checkout.confirm(
        checkoutContext(anonymousId),
        initial.id,
        `confirm-${randomUUID()}`,
      );
      expect(confirmed.state).toBe('CONFIRMED');

      await expect(checkout.extend(checkoutContext(anonymousId), initial.id)).rejects.toMatchObject(
        {
          code: 'CHECKOUT_NOT_EXTENDABLE',
        },
      );
    });

    it('does not extend a reservation that was already released, at the inventory boundary directly', async () => {
      const variantId = await seedVariant(100, 0);
      const anonymousId = randomUUID();
      const { checkout: initial } = await newCheckout(variantId, anonymousId, 1);
      const actor = { actorUserId: null, metadata: { requestId: randomUUID() } };

      // Simulate a subsystem (e.g. a future cancellation flow) releasing the
      // reservation directly at the inventory boundary, bypassing checkout.
      const releaseResult = await inventory.releaseReservations({
        checkoutSessionId: initial.id,
        reason: 'test_release',
        actor,
      });
      expect(releaseResult.released).toBe(1);

      const extension = await inventory.extendReservationsOnce({
        checkoutSessionId: initial.id,
        actor,
      });
      expect(extension).toEqual({ expiresAt: null, extended: false });
    });

    it('extension changes only expiresAt: onHand, reserved, allocated, and ownership stay identical', async () => {
      const variantId = await seedVariant(100, 0);
      const anonymousId = randomUUID();
      const { checkout: initial } = await newCheckout(variantId, anonymousId, 3);
      const before = await prisma.inventoryItem.findUniqueOrThrow({
        where: { variantId_stockLocationId: { variantId, stockLocationId: defaultLocationId } },
      });
      const reservationsBefore = await prisma.stockReservation.findMany({
        where: { checkoutSessionId: initial.id },
      });
      const ledgerCountBefore = await prisma.stockLedgerEntry.count({ where: { variantId } });

      await checkout.extend(checkoutContext(anonymousId), initial.id);

      const after = await prisma.inventoryItem.findUniqueOrThrow({
        where: { variantId_stockLocationId: { variantId, stockLocationId: defaultLocationId } },
      });
      expect(after).toMatchObject({
        onHand: before.onHand,
        reserved: before.reserved,
        allocated: before.allocated,
        version: before.version,
      });
      expect(await prisma.stockLedgerEntry.count({ where: { variantId } })).toBe(ledgerCountBefore);
      const reservationsAfter = await prisma.stockReservation.findMany({
        where: { checkoutSessionId: initial.id },
      });
      expect(reservationsAfter).toHaveLength(reservationsBefore.length);
      for (const row of reservationsAfter) {
        const previous = reservationsBefore.find((candidate) => candidate.id === row.id);
        expect(previous).toBeDefined();
        expect(row.checkoutSessionId).toBe(initial.id);
        expect(row.quantity).toBe(previous?.quantity);
        expect(row.expiresAt.getTime()).toBeGreaterThan(previous?.expiresAt.getTime() ?? 0);
      }
    });
  });

  describe('reservation allocation ordering and idempotency', () => {
    it('allocates from the default location before a non-default location', async () => {
      const variantId = await seedVariant(2, 5);
      const checkoutSessionId = await seedBareCheckoutSession();
      const actor = { actorUserId: null, metadata: { requestId: randomUUID() } };
      const result = await inventory.acquireReservations({
        checkoutSessionId,
        cartId: null,
        lines: [{ variantId, quantity: 4 }],
        actor,
      });
      const byLocation = new Map(
        result.allocations.map((allocation) => [allocation.stockLocationId, allocation.quantity]),
      );
      expect(byLocation.get(defaultLocationId)).toBe(2);
      expect(byLocation.get(secondLocationId)).toBe(2);
    });

    it('rolls back the entire reservation when only partial stock is available across locations', async () => {
      const variantId = await seedVariant(1, 0);
      const checkoutSessionId = await seedBareCheckoutSession();
      const actor = { actorUserId: null, metadata: { requestId: randomUUID() } };
      await expect(
        inventory.acquireReservations({
          checkoutSessionId,
          cartId: null,
          lines: [{ variantId, quantity: 2 }],
          actor,
        }),
      ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
      expect(await prisma.stockReservation.count({ where: { checkoutSessionId } })).toBe(0);
      const item = await prisma.inventoryItem.findUniqueOrThrow({
        where: { variantId_stockLocationId: { variantId, stockLocationId: defaultLocationId } },
      });
      expect(item.reserved).toBe(0);
      expect(item.onHand).toBe(1);
    });

    it('is idempotent: re-acquiring for the same checkout session replays the same allocation instead of doubling it', async () => {
      const variantId = await seedVariant(10, 0);
      const checkoutSessionId = await seedBareCheckoutSession();
      const actor = { actorUserId: null, metadata: { requestId: randomUUID() } };
      const first = await inventory.acquireReservations({
        checkoutSessionId,
        cartId: null,
        lines: [{ variantId, quantity: 3 }],
        actor,
      });
      const second = await inventory.acquireReservations({
        checkoutSessionId,
        cartId: null,
        lines: [{ variantId, quantity: 3 }],
        actor,
      });
      expect(second.replayed).toBe(true);
      expect(await prisma.stockReservation.count({ where: { checkoutSessionId } })).toBe(
        first.allocations.length,
      );
      const item = await prisma.inventoryItem.findUniqueOrThrow({
        where: { variantId_stockLocationId: { variantId, stockLocationId: defaultLocationId } },
      });
      expect(item.reserved).toBe(3);
    });

    it('is idempotent: releasing an already-released reservation twice never double-decrements reserved stock', async () => {
      const variantId = await seedVariant(10, 0);
      const checkoutSessionId = await seedBareCheckoutSession();
      const actor = { actorUserId: null, metadata: { requestId: randomUUID() } };
      await inventory.acquireReservations({
        checkoutSessionId,
        cartId: null,
        lines: [{ variantId, quantity: 2 }],
        actor,
      });
      const first = await inventory.releaseReservations({
        checkoutSessionId,
        reason: 'double_release_test',
        actor,
      });
      const second = await inventory.releaseReservations({
        checkoutSessionId,
        reason: 'double_release_test',
        actor,
      });
      expect(first.released).toBe(1);
      expect(second.released).toBe(0);
      expect(second.alreadyFinal).toBeGreaterThan(0);
      const item = await prisma.inventoryItem.findUniqueOrThrow({
        where: { variantId_stockLocationId: { variantId, stockLocationId: defaultLocationId } },
      });
      expect(item.reserved).toBe(0);
    });

    it('writes RESERVATION and RESERVATION_RELEASE ledger reasons and leaves onHand unaffected by either', async () => {
      const variantId = await seedVariant(10, 0);
      const checkoutSessionId = await seedBareCheckoutSession();
      const actor = { actorUserId: null, metadata: { requestId: randomUUID() } };
      await inventory.acquireReservations({
        checkoutSessionId,
        cartId: null,
        lines: [{ variantId, quantity: 2 }],
        actor,
      });
      await inventory.releaseReservations({
        checkoutSessionId,
        reason: 'ledger_reason_test',
        actor,
      });
      const entries = await prisma.stockLedgerEntry.findMany({
        where: { variantId, refType: 'stock_reservation' },
        orderBy: { createdAt: 'asc' },
      });
      expect(entries.map((entry) => entry.reason)).toEqual(['RESERVATION', 'RESERVATION_RELEASE']);
      const item = await prisma.inventoryItem.findUniqueOrThrow({
        where: { variantId_stockLocationId: { variantId, stockLocationId: defaultLocationId } },
      });
      expect(item.onHand).toBe(10);
    });

    it('detects a manual physical-stock drift against the ledger-reconstructed state', async () => {
      const variantId = await seedVariant(10, 0);
      // This item was created directly, outside the ledger, so the ledger's
      // reconstructed state (0, no movements ever recorded) genuinely differs
      // from the physical row (10). `reconcile` is a global, database-wide
      // admin operation, so this test only exercises the safe, non-mutating
      // dry-run detection path here — running `repair: true` would also
      // rewrite every other fixture variant created by sibling tests in this
      // shared database. The repair path itself (drift -> repair -> clean) is
      // already covered end-to-end against a single dedicated variant in
      // phase11.integration.test.ts.
      const dryRun = await inventory.reconcile(
        staffPrincipal(['inventory:adjust']),
        { requestId: randomUUID() },
        false,
      );
      expect(dryRun.drifted).toBe(true);
      expect(
        dryRun.drifts.some(
          (drift) =>
            drift.variantId === variantId &&
            drift.field === 'onHand' &&
            drift.actual === 10 &&
            drift.expected === 0,
        ),
      ).toBe(true);
      const item = await prisma.inventoryItem.findUniqueOrThrow({
        where: { variantId_stockLocationId: { variantId, stockLocationId: defaultLocationId } },
      });
      expect(item.onHand).toBe(10);
    });
  });

  describe('checkout confirmation contract', () => {
    it('creates exactly one PENDING_PAYMENT/UNPAID order, converts the cart, and marks checkout AWAITING_PAYMENT', async () => {
      const variantId = await seedVariant(100, 0);
      const anonymousId = randomUUID();
      const { checkout: initial } = await newCheckout(variantId, anonymousId, 2);

      const result = await checkout.confirm(
        checkoutContext(anonymousId),
        initial.id,
        `confirm-${randomUUID()}`,
      );
      expect(result.state).toBe('CONFIRMED');
      if (result.state !== 'CONFIRMED') throw new Error('unreachable');

      const orderRow = await prisma.order.findUniqueOrThrow({
        where: { number: result.orderNumber },
      });
      expect(orderRow.status).toBe('PENDING_PAYMENT');
      expect(orderRow.paymentStatus).toBe('UNPAID');
      expect(await prisma.order.count({ where: { checkoutSessionId: initial.id } })).toBe(1);

      const session = await prisma.checkoutSession.findUniqueOrThrow({ where: { id: initial.id } });
      expect(session.status).toBe('AWAITING_PAYMENT');
      const cartRow = await prisma.cart.findUniqueOrThrow({ where: { id: session.cartId } });
      expect(cartRow.status).toBe('CONVERTED');

      const reservations = await prisma.stockReservation.findMany({
        where: { checkoutSessionId: initial.id },
      });
      expect(
        reservations.every((row) => row.status === 'CONSUMED' && row.orderId === orderRow.id),
      ).toBe(true);
    });

    it('replays the same order exactly once when confirmed twice with the same Idempotency-Key concurrently', async () => {
      const variantId = await seedVariant(100, 0);
      const anonymousId = randomUUID();
      const { checkout: initial } = await newCheckout(variantId, anonymousId, 1);
      const key = `confirm-${randomUUID()}`;

      const results = await Promise.all([
        checkout.confirm(checkoutContext(anonymousId), initial.id, key),
        checkout.confirm(checkoutContext(anonymousId), initial.id, key),
      ]);
      expect(results.every((result) => result.state === 'CONFIRMED')).toBe(true);
      const orderNumbers = new Set(
        results.map((result) => (result.state === 'CONFIRMED' ? result.orderNumber : null)),
      );
      expect(orderNumbers.size).toBe(1);
      expect(await prisma.order.count({ where: { checkoutSessionId: initial.id } })).toBe(1);
    });

    it('detects a price drift between start and confirm and returns PRICE_CHANGED without creating an order', async () => {
      const variantId = await seedVariant(100, 0);
      const anonymousId = randomUUID();
      const { checkout: initial } = await newCheckout(variantId, anonymousId, 1);

      await prisma.variantPrice.updateMany({
        where: { variantId, validTo: null },
        data: { validTo: new Date() },
      });
      await prisma.variantPrice.create({
        data: {
          id: randomUUID(),
          variantId,
          currency: 'IRR',
          amountMinor: 9_999n,
          validFrom: new Date(),
          validTo: null,
        },
      });

      const result = await checkout.confirm(
        checkoutContext(anonymousId),
        initial.id,
        `confirm-${randomUUID()}`,
      );
      expect(result.state).toBe('PRICE_CHANGED');
      expect(result.checkout.pricing?.subtotal.amountMinor).toBe('9999');
      expect(await prisma.order.count({ where: { checkoutSessionId: initial.id } })).toBe(0);

      // The client must see the authoritative re-priced snapshot and explicitly re-confirm; a second
      // confirm against the now-current price succeeds and creates exactly one order.
      const second = await checkout.confirm(
        checkoutContext(anonymousId),
        initial.id,
        `confirm-${randomUUID()}`,
      );
      expect(second.state).toBe('CONFIRMED');
      expect(await prisma.order.count({ where: { checkoutSessionId: initial.id } })).toBe(1);
    });

    it('preserves the order line name/attribute snapshot even after the catalog is changed afterward', async () => {
      const variantId = await seedVariant(100, 0);
      const anonymousId = randomUUID();
      const { checkout: initial } = await newCheckout(variantId, anonymousId, 1);
      const result = await checkout.confirm(
        checkoutContext(anonymousId),
        initial.id,
        `confirm-${randomUUID()}`,
      );
      if (result.state !== 'CONFIRMED') throw new Error('unreachable');

      await prisma.variantTranslation.updateMany({
        where: { variantId, locale: 'en' },
        data: { name: 'Renamed after purchase' },
      });
      await prisma.productVariant.update({
        where: { id: variantId },
        data: { netWeightGrams: 999 },
      });

      const owned = await orders.getOwnedOrder(result.orderNumber, { anonymousId });
      expect((owned.lines[0]?.variantNameSnapshot as Record<string, string>)['en']).toBe(
        '450 g jar',
      );
      expect(owned.lines[0]?.quantity).toBe(1);
    });

    it('rejects a differently-payloaded start reusing the same idempotency key instead of silently accepting it', async () => {
      const variantId = await seedVariant(100, 0);
      const anonymousId = randomUUID();
      const key = `start-${randomUUID()}`;
      await cart.addLine(cartContext(anonymousId), { variantId, quantity: 1 });
      await checkout.start(
        checkoutContext(anonymousId),
        startInput({ email: 'first@example.invalid' }),
        key,
      );
      await expect(
        checkout.start(
          checkoutContext(anonymousId),
          startInput({ email: 'second@example.invalid' }),
          key,
        ),
      ).rejects.toMatchObject({
        code: 'VALIDATION_FAILED',
        errors: [{ path: 'idempotencyKey', code: 'IDEMPOTENCY_KEY_REUSE' }],
      });
    });
  });

  describe('cross-owner isolation', () => {
    it('denies reading another owner checkout even with a syntactically valid id', async () => {
      const variantId = await seedVariant(100, 0);
      const ownerA = randomUUID();
      const ownerB = randomUUID();
      const { checkout: initial } = await newCheckout(variantId, ownerA, 1);
      await expect(checkout.get(checkoutContext(ownerB), initial.id)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
      await expect(checkout.extend(checkoutContext(ownerB), initial.id)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('denies reading another owner completed order by its (guessable) order number', async () => {
      const variantId = await seedVariant(100, 0);
      const ownerA = randomUUID();
      const ownerB = randomUUID();
      const { checkout: initial } = await newCheckout(variantId, ownerA, 1);
      const result = await checkout.confirm(
        checkoutContext(ownerA),
        initial.id,
        `confirm-${randomUUID()}`,
      );
      if (result.state !== 'CONFIRMED') throw new Error('unreachable');

      await expect(
        orders.getOwnedOrder(result.orderNumber, { anonymousId: ownerB }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      const owned = await orders.getOwnedOrder(result.orderNumber, { anonymousId: ownerA });
      expect(owned.number).toBe(result.orderNumber);
    });
  });

  describe('concurrency: no oversell, no duplicate orders, no duplicate order numbers', () => {
    it('the last unit of stock resolves exactly one concurrent checkout start and rejects the other with INSUFFICIENT_STOCK', async () => {
      const variantId = await seedVariant(1, 0);
      const ownerA = randomUUID();
      const ownerB = randomUUID();
      await cart.addLine(cartContext(ownerA), { variantId, quantity: 1 });
      await cart.addLine(cartContext(ownerB), { variantId, quantity: 1 });

      const results = await Promise.allSettled([
        checkout.start(checkoutContext(ownerA), startInput(), `start-${randomUUID()}`),
        checkout.start(checkoutContext(ownerB), startInput(), `start-${randomUUID()}`),
      ]);
      const fulfilled = results.filter((result) => result.status === 'fulfilled');
      const rejected = results.filter((result) => result.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
        code: 'INSUFFICIENT_STOCK',
      });

      const item = await prisma.inventoryItem.findUniqueOrThrow({
        where: { variantId_stockLocationId: { variantId, stockLocationId: defaultLocationId } },
      });
      expect(item.reserved).toBe(1);
      expect(item.onHand).toBe(1);
    });

    it('generates unique order numbers across concurrent independent confirmations', async () => {
      const variantId = await seedVariant(1000, 0);
      const owners = Array.from({ length: 5 }, () => randomUUID());
      const started = await Promise.all(owners.map((owner) => newCheckout(variantId, owner, 1)));
      const results = await Promise.all(
        started.map(({ checkout: session }, index) =>
          checkout.confirm(
            checkoutContext(owners[index] as string),
            session.id,
            `confirm-${randomUUID()}`,
          ),
        ),
      );
      const orderNumbers = results.map((result) =>
        result.state === 'CONFIRMED' ? result.orderNumber : null,
      );
      expect(orderNumbers.every((number) => number !== null)).toBe(true);
      expect(new Set(orderNumbers).size).toBe(orderNumbers.length);
      for (const number of orderNumbers) {
        expect(number).toMatch(/^HNY-[0-9]{4}-[0-9]{6}$/u);
      }
    });

    it('serializes an expiry-lazy-read against a confirm on the same already-elapsed reservation without double effects', async () => {
      const variantId = await seedVariant(100, 0);
      const anonymousId = randomUUID();
      const { checkout: initial } = await newCheckout(variantId, anonymousId, 1);
      const past = new Date(Date.now() - 1_000);
      await prisma.checkoutSession.update({
        where: { id: initial.id },
        data: { reservationExpiresAt: past },
      });
      await prisma.stockReservation.updateMany({
        where: { checkoutSessionId: initial.id },
        data: { expiresAt: past },
      });

      const results = await Promise.allSettled([
        checkout.get(checkoutContext(anonymousId), initial.id),
        checkout.confirm(checkoutContext(anonymousId), initial.id, `confirm-${randomUUID()}`),
      ]);
      // Whichever transaction observes the elapsed hold first, no order is created and the reservation
      // is never revived by the other. Exactly zero orders and zero ACTIVE reservations remain.
      expect(await prisma.order.count({ where: { checkoutSessionId: initial.id } })).toBe(0);
      const reservations = await prisma.stockReservation.findMany({
        where: { checkoutSessionId: initial.id },
      });
      expect(reservations.every((row) => row.status !== 'ACTIVE')).toBe(true);
      const confirmOutcome = results[1];
      if (confirmOutcome.status === 'rejected') {
        expect((confirmOutcome.reason as { code?: string }).code).toMatch(
          /RESERVATION_EXPIRED|CHECKOUT_NOT_CONFIRMABLE/u,
        );
      }
    });

    it('enforces a coupon usage-limit exactly once across two concurrent confirmations sharing the coupon', async () => {
      const variantId = await seedVariant(100, 0);
      const code = `PHASE13LIMIT${randomUUID().replaceAll('-', '').slice(0, 8)}`.toUpperCase();
      await prisma.coupon.create({
        data: {
          id: randomUUID(),
          code,
          type: 'PERCENT',
          value: 1000n,
          currency: null,
          minSubtotalMinor: null,
          maxDiscountMinor: null,
          startsAt: new Date(Date.now() - 60 * 60 * 1000),
          endsAt: null,
          usageLimitTotal: 1,
          appliesTo: 'ALL',
          targetIds: [],
          status: 'ACTIVE',
        },
      });
      const ownerA = randomUUID();
      const ownerB = randomUUID();
      await cart.addLine(cartContext(ownerA), { variantId, quantity: 1 });
      await cart.applyCoupon(cartContext(ownerA), code);
      await cart.addLine(cartContext(ownerB), { variantId, quantity: 1 });
      await cart.applyCoupon(cartContext(ownerB), code);
      const startedA = await checkout.start(
        checkoutContext(ownerA),
        startInput(),
        `start-${randomUUID()}`,
      );
      const startedB = await checkout.start(
        checkoutContext(ownerB),
        startInput(),
        `start-${randomUUID()}`,
      );

      const results = await Promise.allSettled([
        checkout.confirm(checkoutContext(ownerA), startedA.checkout.id, `confirm-${randomUUID()}`),
        checkout.confirm(checkoutContext(ownerB), startedB.checkout.id, `confirm-${randomUUID()}`),
      ]);
      const fulfilled = results.filter(
        (result) => result.status === 'fulfilled' && result.value.state === 'CONFIRMED',
      );
      expect(fulfilled).toHaveLength(1);
      const couponRow = await prisma.coupon.findFirstOrThrow({ where: { code } });
      const redemptions = await prisma.couponRedemption.count({
        where: { couponId: couponRow.id },
      });
      expect(redemptions).toBe(1);
    });
  });
});
