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
import { InventoryService } from '../src/modules/inventory/application/inventory.service.js';
import { PrismaInventoryRepository } from '../src/modules/inventory/infrastructure/prisma-inventory.repository.js';
import { PricingService } from '../src/modules/pricing/application/pricing.service.js';
import { PrismaPricingRepository } from '../src/modules/pricing/infrastructure/prisma-pricing.repository.js';

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

function context(anonymousId: string, userId: string | null = null): CartRequestContext {
  return { anonymousId, userId, locale: 'en', currency: 'IRR' };
}

async function createTemporaryDatabase(): Promise<TemporaryDatabase> {
  const base = new URL(
    process.env['DATABASE_URL'] ??
      'postgresql://honey_local:replace-with-local-development-password@127.0.0.1:5432/honey_local',
  );
  const databaseName = `honey_phase12_${randomUUID().replaceAll('-', '')}`;
  if (!/^honey_phase12_[a-f0-9]{32}$/u.test(databaseName)) throw new Error('Unsafe database name.');
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

describe('Phase 12 cart and pricing on PostgreSQL', () => {
  let database: TemporaryDatabase;
  let prisma: PrismaClient;
  let cartRepository: PrismaCartRepository;
  let inventoryRepository: PrismaInventoryRepository;
  let pricingRepository: PrismaPricingRepository;
  let cart: CartService;
  let variantId = '';
  let customerId = '';
  let stockLocationId = '';

  beforeAll(async () => {
    database = await createTemporaryDatabase();
    await migrate(database.databaseUrl);
    prisma = createPrismaClient({ databaseUrl: database.databaseUrl });
    cartRepository = new PrismaCartRepository(database.databaseUrl);
    inventoryRepository = new PrismaInventoryRepository(database.databaseUrl);
    pricingRepository = new PrismaPricingRepository(database.databaseUrl);

    const inventory = new InventoryService(inventoryRepository);
    const pricing = new PricingService(pricingRepository, { enabledCurrencies: ['IRR'] });
    cart = new CartService(
      cartRepository,
      new InventoryCartAvailabilityAdapter(inventory),
      new PricingCartAdapter(pricing),
      cartConfig,
    );

    customerId = randomUUID();
    await prisma.user.create({
      data: {
        id: customerId,
        email: 'phase12-customer@example.invalid',
        preferredLocale: 'en',
      },
    });
    const product = await prisma.product.create({
      data: {
        id: randomUUID(),
        sku: 'PHASE12-PRODUCT',
        sourcingType: 'OWN_PRODUCTION',
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
    });
    variantId = randomUUID();
    await prisma.productVariant.create({
      data: {
        id: variantId,
        productId: product.id,
        sku: 'PHASE12-VARIANT-450',
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
        productId: product.id,
        locale: 'en',
        name: 'Phase twelve honey',
        slug: 'phase-twelve-honey',
      },
    });
    await prisma.variantTranslation.create({
      data: {
        id: randomUUID(),
        variantId,
        locale: 'en',
        name: '450 g jar',
      },
    });
    stockLocationId = randomUUID();
    await prisma.stockLocation.create({
      data: {
        id: stockLocationId,
        code: 'PHASE12-WH',
        name: 'Phase 12 warehouse',
        type: 'WAREHOUSE',
        isSellable: true,
        isDefault: true,
      },
    });
    await prisma.inventoryItem.create({
      data: {
        id: randomUUID(),
        variantId,
        stockLocationId,
        onHand: 10,
        reserved: 0,
        allocated: 0,
      },
    });

    const now = Date.now();
    await prisma.variantPrice.createMany({
      data: [
        {
          id: randomUUID(),
          variantId,
          currency: 'IRR',
          amountMinor: 100n,
          validFrom: new Date(now - 4 * 60 * 60 * 1000),
          validTo: new Date(now - 2 * 60 * 60 * 1000),
        },
        {
          id: randomUUID(),
          variantId,
          currency: 'IRR',
          amountMinor: 125n,
          validFrom: new Date(now - 60 * 60 * 1000),
          validTo: null,
        },
        {
          id: randomUUID(),
          variantId,
          currency: 'IRR',
          amountMinor: 150n,
          validFrom: new Date(now + 60 * 60 * 1000),
          validTo: null,
        },
      ],
    });
    await prisma.coupon.create({
      data: {
        id: randomUUID(),
        code: 'MiXeD10',
        type: 'PERCENT',
        value: 1000n,
        currency: null,
        minSubtotalMinor: null,
        maxDiscountMinor: null,
        startsAt: new Date(now - 60 * 60 * 1000),
        endsAt: null,
        appliesTo: 'ALL',
        targetIds: [],
        status: 'ACTIVE',
      },
    });
  }, 120_000);

  afterAll(async () => {
    await cartRepository?.close();
    await inventoryRepository?.close();
    await pricingRepository?.close();
    await prisma?.$disconnect();
    if (database !== undefined) await dropTemporaryDatabase(database);
  });

  it('selects the latest currently valid price from PostgreSQL and serializes it in the cart', async () => {
    const pricing = new PricingService(pricingRepository, { enabledCurrencies: ['IRR'] });
    const current = await pricing.resolvePrices([variantId], 'IRR', new Date());
    expect(current.get(variantId)?.amountMinor).toBe(125n);

    const anonymousId = randomUUID();
    const view = await cart.addLine(context(anonymousId), { variantId, quantity: 2 });
    expect(view.lines).toHaveLength(1);
    expect(view.lines[0]?.state).toBe('PURCHASABLE');
    expect(view.lines[0]?.unitPrice).toEqual({ amountMinor: '125', currency: 'IRR' });
    expect(view.subtotal).toEqual({ amountMinor: '250', currency: 'IRR' });
  });

  it('supports anonymous cart operations and finds a mixed-case coupon case-insensitively', async () => {
    const anonymousId = randomUUID();
    const added = await cart.addLine(context(anonymousId), { variantId, quantity: 2 });
    const line = added.lines[0];
    if (line === undefined) throw new Error('Expected a cart line.');

    const updated = await cart.updateLine(context(anonymousId), line.id, { quantity: 3 });
    expect(updated.lines[0]?.quantity).toBe(3);
    const discounted = await cart.applyCoupon(context(anonymousId), 'mixed10');
    expect(discounted.coupon).toMatchObject({ code: 'MIXED10', state: 'APPLIED' });
    expect(discounted.subtotal.amountMinor).toBe('375');
    expect(discounted.discountTotal.amountMinor).toBe('38');
    expect(discounted.merchandiseTotal.amountMinor).toBe('337');
  });

  it('expires an active anonymous cart and starts a fresh cart instead of reviving it', async () => {
    const anonymousId = randomUUID();
    const initial = await cart.addLine(context(anonymousId), { variantId, quantity: 1 });
    const expiredAt = new Date(Date.now() - 1_000);
    await prisma.cart.update({
      where: { id: initial.id },
      data: { createdAt: new Date(expiredAt.getTime() - 1_000), expiresAt: expiredAt },
    });

    const fresh = await cart.getCart(context(anonymousId));
    expect(fresh.id).not.toBe(initial.id);
    expect(fresh.lines).toEqual([]);
    expect((await prisma.cart.findUnique({ where: { id: initial.id } }))?.status).toBe('ABANDONED');
  });

  it('merges an anonymous cart into a user cart once, clamps safely, and retains one line', async () => {
    const anonymousId = randomUUID();
    await prisma.inventoryItem.update({
      where: { variantId_stockLocationId: { variantId, stockLocationId } },
      data: { onHand: 5 },
    });
    await cart.addLine(context(anonymousId), { variantId, quantity: 3 });
    await cart.addLine(context(randomUUID(), customerId), { variantId, quantity: 4 });

    const signedIn = context(anonymousId, customerId);
    const merged = await cart.getCart(signedIn);
    expect(merged.lines).toHaveLength(1);
    expect(merged.lines[0]?.quantity).toBe(5);
    const repeated = await cart.getCart(signedIn);
    expect(repeated.lines).toHaveLength(1);
    expect(repeated.lines[0]?.quantity).toBe(5);

    const carts = await prisma.cart.findMany({
      where: { OR: [{ anonymousId }, { userId: customerId }] },
      include: { lines: true },
    });
    expect(
      carts.filter((row) => row.status === 'ACTIVE' && row.userId === customerId),
    ).toHaveLength(1);
    expect(
      carts.filter((row) => row.status === 'MERGED' && row.anonymousId === anonymousId),
    ).toHaveLength(1);
    expect(
      carts.flatMap((row) => row.lines).filter((line) => line.variantId === variantId),
    ).toHaveLength(1);
  });

  it('serializes concurrent adds and updates on an existing cart without duplicate lines or inventory mutation', async () => {
    const anonymousId = randomUUID();
    const initial = await cart.addLine(context(anonymousId), { variantId, quantity: 1 });
    const beforeItem = await prisma.inventoryItem.findUnique({
      where: { variantId_stockLocationId: { variantId, stockLocationId } },
    });
    const ledgerBefore = await prisma.stockLedgerEntry.count({ where: { variantId } });
    const reservationsBefore = await prisma.stockReservation.count({ where: { variantId } });

    await Promise.all([
      cart.addLine(context(anonymousId), { variantId, quantity: 1 }),
      cart.addLine(context(anonymousId), { variantId, quantity: 1 }),
    ]);
    const afterAdds = await cart.getCart(context(anonymousId));
    expect(afterAdds.lines).toHaveLength(1);
    expect(afterAdds.lines[0]?.quantity).toBe(3);

    const lineId = initial.lines[0]?.id;
    if (lineId === undefined) throw new Error('Expected an existing cart line.');
    await Promise.all([
      cart.updateLine(context(anonymousId), lineId, { quantity: 4 }),
      cart.updateLine(context(anonymousId), lineId, { quantity: 5 }),
    ]);
    const afterUpdates = await cart.getCart(context(anonymousId));
    expect(afterUpdates.lines).toHaveLength(1);
    expect([4, 5]).toContain(afterUpdates.lines[0]?.quantity);

    const afterItem = await prisma.inventoryItem.findUnique({
      where: { variantId_stockLocationId: { variantId, stockLocationId } },
    });
    expect(afterItem).toMatchObject({
      onHand: beforeItem?.onHand,
      reserved: beforeItem?.reserved,
      allocated: beforeItem?.allocated,
      version: beforeItem?.version,
    });
    expect(await prisma.stockLedgerEntry.count({ where: { variantId } })).toBe(ledgerBefore);
    expect(await prisma.stockReservation.count({ where: { variantId } })).toBe(reservationsBefore);
    expect(await prisma.cartLine.count({ where: { cartId: afterUpdates.id, variantId } })).toBe(1);
  });

  it('serializes concurrent first adds so an owner receives exactly one active cart', async () => {
    const anonymousId = randomUUID();
    const [first, second] = await Promise.all([
      cart.addLine(context(anonymousId), { variantId, quantity: 1 }),
      cart.addLine(context(anonymousId), { variantId, quantity: 1 }),
    ]);

    expect(first.id).toBe(second.id);
    expect(await prisma.cart.count({ where: { status: 'ACTIVE', anonymousId } })).toBe(1);
    const view = await cart.getCart(context(anonymousId));
    expect(view.lines).toHaveLength(1);
    expect(view.lines[0]?.quantity).toBe(2);
  });

  it('deduplicates concurrent increment retries by idempotency key', async () => {
    const anonymousId = randomUUID();
    const key = `cart-add-retry-${randomUUID()}`;
    const input = { variantId, quantity: 1 };
    const results = await Promise.all([
      cart.addLineWithIdempotency(context(anonymousId), input, key),
      cart.addLineWithIdempotency(context(anonymousId), input, key),
    ]);

    expect(results.map((result) => result.replayed).sort()).toEqual([false, true]);
    const view = await cart.getCart(context(anonymousId));
    expect(view.lines).toHaveLength(1);
    expect(view.lines[0]?.quantity).toBe(1);
    await expect(
      cart.addLineWithIdempotency(context(anonymousId), { variantId, quantity: 2 }, key),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      errors: [{ path: 'idempotencyKey', code: 'IDEMPOTENCY_KEY_REUSE' }],
    });
  });

  it('makes an update racing with removal converge to a removed line', async () => {
    const anonymousId = randomUUID();
    const added = await cart.addLine(context(anonymousId), { variantId, quantity: 1 });
    const lineId = added.lines[0]?.id;
    if (lineId === undefined) throw new Error('Expected an existing cart line.');

    const results = await Promise.allSettled([
      cart.updateLine(context(anonymousId), lineId, { quantity: 2 }),
      cart.removeLine(context(anonymousId), lineId),
    ]);

    expect(results.some((result) => result.status === 'fulfilled')).toBe(true);
    expect((await cart.getCart(context(anonymousId))).lines).toEqual([]);
  });

  it('serializes concurrent anonymous handoffs into one new user cart', async () => {
    const firstAnonymousId = randomUUID();
    const secondAnonymousId = randomUUID();
    const userId = randomUUID();
    await prisma.user.create({
      data: {
        id: userId,
        email: `phase12-handoff-${userId}@example.invalid`,
        preferredLocale: 'en',
      },
    });
    await cart.addLine(context(firstAnonymousId), { variantId, quantity: 1 });
    await cart.addLine(context(secondAnonymousId), { variantId, quantity: 1 });

    await Promise.all([
      cart.getCart(context(firstAnonymousId, userId)),
      cart.getCart(context(secondAnonymousId, userId)),
    ]);

    const active = await prisma.cart.findMany({
      where: { status: 'ACTIVE', userId },
      include: { lines: true },
    });
    expect(active).toHaveLength(1);
    expect(active[0]?.lines).toHaveLength(1);
    expect(active[0]?.lines[0]?.quantity).toBe(2);
    expect(
      await prisma.cart.count({
        where: {
          status: 'MERGED',
          anonymousId: { in: [firstAnonymousId, secondAnonymousId] },
        },
      }),
    ).toBe(1);
  });
});
