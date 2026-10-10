import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { createPrismaClient, type PrismaClient } from '@honey/db';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { FulfilmentService } from '../src/modules/fulfilment/application/fulfilment.service.js';
import type {
  FulfilmentNotification,
  FulfilmentNotificationPort,
} from '../src/modules/fulfilment/domain/fulfilment.js';
import { PrismaFulfilmentRepository } from '../src/modules/fulfilment/infrastructure/prisma-fulfilment.repository.js';
import type { AuthenticatedPrincipal } from '../src/modules/identity/domain/identity.js';
import { InventoryService } from '../src/modules/inventory/application/inventory.service.js';
import { PrismaInventoryRepository } from '../src/modules/inventory/infrastructure/prisma-inventory.repository.js';
import { OrdersService } from '../src/modules/orders/application/orders.service.js';
import { PrismaOrdersRepository } from '../src/modules/orders/infrastructure/prisma-orders.repository.js';
import { ManualFlatShippingProvider } from '../src/modules/shipping/infrastructure/manual-flat-shipping.provider.js';
import type {
  ShipmentCreationInput,
  ShipmentCreationResult,
} from '../src/modules/shipping/domain/shipping.js';
import { PrismaPlatformAdapter } from '../src/platform/infrastructure/prisma-platform.adapter.js';

const execFileAsync = promisify(execFile);
const dbDirectory = fileURLToPath(new URL('../../db/', import.meta.url));
const prismaCli = fileURLToPath(
  new URL('../../db/node_modules/prisma/build/index.js', import.meta.url),
);

type TemporaryDatabase = Readonly<{ adminUrl: string; databaseName: string; databaseUrl: string }>;
type StockPlan = Readonly<{ locationId: string; quantity: number; onHand: number }>;
type OrderFixture = Readonly<{
  orderId: string;
  orderLineId: string;
  variantId: string;
  quantity: number;
}>;

async function createTemporaryDatabase(): Promise<TemporaryDatabase> {
  const base = new URL(
    process.env['DATABASE_URL'] ??
      'postgresql://honey_local:replace-with-local-development-password@127.0.0.1:5432/honey_local',
  );
  const databaseName = `honey_phase15_fulfilment_${randomUUID().replaceAll('-', '')}`;
  if (!/^honey_phase15_fulfilment_[a-f0-9]{32}$/u.test(databaseName)) {
    throw new Error('Unsafe database name.');
  }
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

class RecordingNotifications implements FulfilmentNotificationPort {
  readonly shipped: FulfilmentNotification[] = [];
  readonly delivered: FulfilmentNotification[] = [];

  async sendShipped(notification: FulfilmentNotification): Promise<void> {
    this.shipped.push(notification);
  }

  async sendDelivered(notification: FulfilmentNotification): Promise<void> {
    this.delivered.push(notification);
  }
}

/** Hold the first draft after it has locked the order row. */
class BlockingProvider extends ManualFlatShippingProvider {
  readonly entered: Promise<void>;
  readonly #resume: Promise<void>;
  #signalEntered: (() => void) | undefined;
  #signalResume: (() => void) | undefined;

  constructor() {
    super();
    this.entered = new Promise<void>((resolve) => {
      this.#signalEntered = resolve;
    });
    this.#resume = new Promise<void>((resolve) => {
      this.#signalResume = resolve;
    });
  }

  override async createShipment(input: ShipmentCreationInput): Promise<ShipmentCreationResult> {
    this.#signalEntered?.();
    await this.#resume;
    return super.createShipment(input);
  }

  release(): void {
    this.#signalResume?.();
  }
}

describe('Phase 15 fulfilment on PostgreSQL', () => {
  let database: TemporaryDatabase;
  let prisma: PrismaClient;
  let fulfilmentRepository: PrismaFulfilmentRepository;
  let inventoryRepository: PrismaInventoryRepository;
  let ordersRepository: PrismaOrdersRepository;
  let platform: PrismaPlatformAdapter;
  let fulfilment: FulfilmentService;
  let orders: OrdersService;
  let inventory: InventoryService;
  let notifications: RecordingNotifications;
  let staff: AuthenticatedPrincipal;
  let firstLocationId: string;
  let secondLocationId: string;
  let orderCounter = 100_000;

  function serviceWithProvider(provider: ManualFlatShippingProvider): FulfilmentService {
    return new FulfilmentService(
      fulfilmentRepository,
      orders,
      inventory,
      platform,
      provider,
      notifications,
    );
  }

  async function seedOrder(
    plan: readonly StockPlan[],
    paymentState: 'PAID' | 'UNPAID' = 'PAID',
  ): Promise<OrderFixture> {
    const quantity = plan.reduce((sum, row) => sum + row.quantity, 0);
    const productId = randomUUID();
    const variantId = randomUUID();
    const orderId = randomUUID();
    const orderLineId = randomUUID();
    orderCounter += 1;
    await prisma.product.create({
      data: {
        id: productId,
        sku: `PHASE15-P-${productId}`,
        sourcingType: 'OWN_PRODUCTION',
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
    });
    await prisma.productVariant.create({
      data: {
        id: variantId,
        productId,
        sku: `PHASE15-V-${variantId}`,
        status: 'PUBLISHED',
        netWeightGrams: 450,
        jarSizeLabelKey: 'jar.450g',
        packagingTypeKey: 'packaging.glass',
        weightGramsShipping: 700,
        dimensionsMm: [85, 85, 120],
      },
    });
    await prisma.order.create({
      data: {
        id: orderId,
        number: `HNY-2026-${orderCounter}`,
        email: `phase15-${orderId}@example.invalid`,
        localeAtPurchase: 'en',
        currency: 'IRR',
        status: paymentState === 'PAID' ? 'PAID' : 'PENDING_PAYMENT',
        paymentStatus: paymentState,
        fulfilmentStatus: 'UNFULFILLED',
        subtotalMinor: BigInt(quantity * 1_000),
        grandTotalMinor: BigInt(quantity * 1_000),
        shippingMethodSnapshot: { methodCode: 'STANDARD', amountMinor: '0' },
        shippingAddressSnapshot: {},
        billingAddressSnapshot: {},
      },
    });
    await prisma.orderLine.create({
      data: {
        id: orderLineId,
        orderId,
        productId,
        variantId,
        skuSnapshot: `PHASE15-V-${variantId}`,
        productNameSnapshot: { en: 'Phase 15 honey' },
        variantNameSnapshot: { en: '450 g jar' },
        attributesSnapshot: {},
        quantity,
        unitPriceMinor: 1_000n,
        taxRateBps: 0,
        lineTotalMinor: BigInt(quantity * 1_000),
      },
    });
    for (const row of plan) {
      const reservationId = randomUUID();
      await prisma.inventoryItem.create({
        data: {
          id: randomUUID(),
          variantId,
          stockLocationId: row.locationId,
          onHand: row.onHand,
          allocated: row.quantity,
        },
      });
      await prisma.stockReservation.create({
        data: {
          id: reservationId,
          variantId,
          stockLocationId: row.locationId,
          orderId,
          quantity: row.quantity,
          status: 'CONSUMED',
          expiresAt: new Date(Date.now() + 60_000),
          consumedAt: new Date(),
        },
      });
      await prisma.stockLedgerEntry.createMany({
        data: [
          {
            id: randomUUID(),
            variantId,
            stockLocationId: row.locationId,
            delta: row.onHand,
            reason: 'RECEIPT',
            refType: 'order',
            refId: orderId,
          },
          {
            id: randomUUID(),
            variantId,
            stockLocationId: row.locationId,
            delta: row.quantity,
            reason: 'RESERVATION',
            refType: 'stock_reservation',
            refId: reservationId,
          },
          {
            id: randomUUID(),
            variantId,
            stockLocationId: row.locationId,
            delta: row.quantity,
            reason: 'ALLOCATION',
            refType: 'stock_reservation',
            refId: reservationId,
          },
        ],
      });
    }
    return { orderId, orderLineId, variantId, quantity };
  }

  function shipmentInput(fixture: OrderFixture, quantity: number, key = `ship-${randomUUID()}`) {
    return {
      orderId: fixture.orderId,
      lines: [{ orderLineId: fixture.orderLineId, quantity }],
      idempotencyKey: key,
    };
  }

  beforeAll(async () => {
    database = await createTemporaryDatabase();
    await migrate(database.databaseUrl);
    prisma = createPrismaClient({ databaseUrl: database.databaseUrl });
    fulfilmentRepository = new PrismaFulfilmentRepository(database.databaseUrl);
    inventoryRepository = new PrismaInventoryRepository(database.databaseUrl);
    ordersRepository = new PrismaOrdersRepository(database.databaseUrl);
    platform = new PrismaPlatformAdapter(database.databaseUrl);
    orders = new OrdersService(ordersRepository);
    inventory = new InventoryService(inventoryRepository);
    notifications = new RecordingNotifications();
    fulfilment = serviceWithProvider(new ManualFlatShippingProvider());

    const staffId = randomUUID();
    await prisma.user.create({
      data: {
        id: staffId,
        email: `phase15-staff-${staffId}@example.invalid`,
        isStaff: true,
      },
    });
    staff = {
      userId: staffId,
      sessionId: randomUUID(),
      kind: 'STAFF',
      permissions: ['order:read', 'order:write', 'order:cancel'],
    };
    firstLocationId = randomUUID();
    secondLocationId = randomUUID();
    await prisma.stockLocation.createMany({
      data: [
        {
          id: firstLocationId,
          code: 'PHASE15-WH-A',
          name: 'Phase 15 warehouse A',
          type: 'WAREHOUSE',
          isSellable: true,
          isDefault: true,
        },
        {
          id: secondLocationId,
          code: 'PHASE15-WH-B',
          name: 'Phase 15 warehouse B',
          type: 'WAREHOUSE',
          isSellable: true,
          isDefault: false,
        },
      ],
    });
  }, 120_000);

  afterAll(async () => {
    await fulfilmentRepository?.close();
    await inventoryRepository?.close();
    await ordersRepository?.close();
    await platform?.close();
    await prisma?.$disconnect();
    if (database !== undefined) await dropTemporaryDatabase(database);
  });

  it('reserves draft claims without physical movement, then dispatches each location exactly once', async () => {
    const fixture = await seedOrder([
      { locationId: firstLocationId, quantity: 2, onHand: 7 },
      { locationId: secondLocationId, quantity: 1, onHand: 5 },
    ]);
    const input = shipmentInput(fixture, fixture.quantity);
    const metadata = { requestId: randomUUID() };
    const draft = await fulfilment.createShipment(staff, input, metadata);
    expect(draft.status).toBe('PENDING');
    expect(await fulfilment.createShipment(staff, input, metadata)).toEqual(draft);
    await expect(
      fulfilment.createShipment(
        staff,
        { ...input, lines: [{ orderLineId: fixture.orderLineId, quantity: 2 }] },
        metadata,
      ),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      errors: [{ path: 'idempotencyKey', code: 'IDEMPOTENCY_KEY_REUSE' }],
    });
    expect(await prisma.shipment.count({ where: { orderId: fixture.orderId } })).toBe(1);
    const before = await prisma.inventoryItem.findMany({ where: { variantId: fixture.variantId } });
    expect(before.map((row) => [row.onHand, row.allocated, row.reserved]).sort()).toEqual(
      [
        [7, 2, 0],
        [5, 1, 0],
      ].sort(),
    );
    expect(
      await prisma.stockLedgerEntry.count({
        where: { variantId: fixture.variantId, reason: 'FULFILMENT' },
      }),
    ).toBe(0);

    const shipped = await fulfilment.markShipped(staff, draft.id, metadata);
    expect(shipped.status).toBe('IN_TRANSIT');
    expect(shipped.shippedAt).not.toBeNull();
    const first = await prisma.inventoryItem.findUniqueOrThrow({
      where: {
        variantId_stockLocationId: {
          variantId: fixture.variantId,
          stockLocationId: firstLocationId,
        },
      },
    });
    const second = await prisma.inventoryItem.findUniqueOrThrow({
      where: {
        variantId_stockLocationId: {
          variantId: fixture.variantId,
          stockLocationId: secondLocationId,
        },
      },
    });
    expect(first).toMatchObject({ onHand: 5, allocated: 0, reserved: 0 });
    expect(second).toMatchObject({ onHand: 4, allocated: 0, reserved: 0 });
    const movements = await prisma.stockLedgerEntry.findMany({
      where: { variantId: fixture.variantId, reason: 'FULFILMENT' },
      orderBy: { stockLocationId: 'asc' },
    });
    expect(movements.map((row) => [row.stockLocationId, row.delta, row.refId]).sort()).toEqual(
      [
        [firstLocationId, -2, draft.id],
        [secondLocationId, -1, draft.id],
      ].sort(),
    );
    expect(await prisma.order.findUniqueOrThrow({ where: { id: fixture.orderId } })).toMatchObject({
      status: 'FULFILLED',
      fulfilmentStatus: 'FULFILLED',
    });

    await fulfilment.markShipped(staff, draft.id, metadata);
    await fulfilment.markDelivered(staff, draft.id, metadata);
    await fulfilment.markDelivered(staff, draft.id, metadata);
    expect(
      await prisma.stockLedgerEntry.count({
        where: { variantId: fixture.variantId, reason: 'FULFILMENT' },
      }),
    ).toBe(2);
    expect(await prisma.trackingEvent.count({ where: { shipmentId: draft.id } })).toBe(2);
    expect(
      await prisma.auditLog.count({
        where: { subjectId: draft.id, action: 'shipment.shipped' },
      }),
    ).toBe(1);
    const emailEvents = await prisma.outboxEvent.findMany({
      where: {
        aggregateType: 'shipment',
        aggregateId: draft.id,
        eventType: { in: ['shipment.shipped', 'shipment.delivered'] },
      },
      orderBy: { createdAt: 'asc' },
    });
    expect(emailEvents.map((event) => event.eventType).sort()).toEqual([
      'shipment.delivered',
      'shipment.shipped',
    ]);
    expect(notifications.shipped).toHaveLength(0);
    expect(notifications.delivered).toHaveLength(0);

    const context = {
      kind: 'SYSTEM',
      source: 'WORKER',
      correlationId: 'phase16-fulfilment-email',
    } as const;
    await fulfilment.sendNotificationForSystem(context, { shipmentId: draft.id, kind: 'SHIPPED' });
    await fulfilment.sendNotificationForSystem(context, {
      shipmentId: draft.id,
      kind: 'DELIVERED',
    });
    expect(notifications.shipped).toMatchObject([
      { shipmentId: draft.id, locale: 'en', trackingNumber: draft.trackingNumber },
    ]);
    expect(notifications.delivered).toMatchObject([
      { shipmentId: draft.id, locale: 'en', trackingNumber: draft.trackingNumber },
    ]);
    expect(notifications.shipped[0]?.email).toBe(
      (await prisma.order.findUniqueOrThrow({ where: { id: fixture.orderId } })).email,
    );
  }, 30_000);

  it('allows partial dispatch, but cannot claim the same allocated units twice', async () => {
    const fixture = await seedOrder([{ locationId: firstLocationId, quantity: 3, onHand: 8 }]);
    const first = await fulfilment.createShipment(staff, shipmentInput(fixture, 1), {
      requestId: randomUUID(),
    });
    await fulfilment.markShipped(staff, first.id, { requestId: randomUUID() });
    expect(await prisma.order.findUniqueOrThrow({ where: { id: fixture.orderId } })).toMatchObject({
      status: 'PARTIALLY_FULFILLED',
      fulfilmentStatus: 'PARTIAL',
    });
    await expect(
      fulfilment.createShipment(staff, shipmentInput(fixture, 3), { requestId: randomUUID() }),
    ).rejects.toMatchObject({ code: 'ALLOCATION_MISMATCH' });
    const second = await fulfilment.createShipment(staff, shipmentInput(fixture, 2), {
      requestId: randomUUID(),
    });
    await fulfilment.markShipped(staff, second.id, { requestId: randomUUID() });
    const item = await prisma.inventoryItem.findUniqueOrThrow({
      where: {
        variantId_stockLocationId: {
          variantId: fixture.variantId,
          stockLocationId: firstLocationId,
        },
      },
    });
    expect(item).toMatchObject({ onHand: 5, allocated: 0, reserved: 0 });
    expect(await prisma.order.findUniqueOrThrow({ where: { id: fixture.orderId } })).toMatchObject({
      status: 'FULFILLED',
      fulfilmentStatus: 'FULFILLED',
    });
  }, 30_000);

  it('serializes competing drafts so their combined claim cannot exceed an order line', async () => {
    const fixture = await seedOrder([{ locationId: firstLocationId, quantity: 3, onHand: 8 }]);
    const blocking = new BlockingProvider();
    const concurrent = serviceWithProvider(blocking);
    const first = concurrent.createShipment(staff, shipmentInput(fixture, 2), {
      requestId: randomUUID(),
    });
    await blocking.entered;
    const second = concurrent.createShipment(staff, shipmentInput(fixture, 2), {
      requestId: randomUUID(),
    });
    blocking.release();
    const outcomes = await Promise.allSettled([first, second]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(
      outcomes.filter((outcome) => outcome.status === 'rejected').map((outcome) => outcome.reason),
    ).toEqual([expect.objectContaining({ code: 'ALLOCATION_MISMATCH' })]);
    expect(await prisma.shipment.count({ where: { orderId: fixture.orderId } })).toBe(1);
    expect(
      await prisma.shipmentLineAllocation.aggregate({
        where: { shipmentLine: { shipment: { orderId: fixture.orderId } } },
        _sum: { quantity: true },
      }),
    ).toMatchObject({ _sum: { quantity: 2 } });
    expect(
      await prisma.stockLedgerEntry.count({
        where: { variantId: fixture.variantId, reason: 'FULFILMENT' },
      }),
    ).toBe(0);
  }, 30_000);

  it('rolls back shipment status and movement if allocated stock is missing at dispatch', async () => {
    const fixture = await seedOrder([{ locationId: firstLocationId, quantity: 2, onHand: 5 }]);
    const draft = await fulfilment.createShipment(staff, shipmentInput(fixture, 2), {
      requestId: randomUUID(),
    });
    await prisma.inventoryItem.update({
      where: {
        variantId_stockLocationId: {
          variantId: fixture.variantId,
          stockLocationId: firstLocationId,
        },
      },
      data: { allocated: 1 },
    });
    await expect(
      fulfilment.markShipped(staff, draft.id, { requestId: randomUUID() }),
    ).rejects.toMatchObject({ code: 'ALLOCATION_MISMATCH' });
    expect(await prisma.shipment.findUniqueOrThrow({ where: { id: draft.id } })).toMatchObject({
      status: 'PENDING',
      shippedAt: null,
    });
    expect(
      await prisma.inventoryItem.findUniqueOrThrow({
        where: {
          variantId_stockLocationId: {
            variantId: fixture.variantId,
            stockLocationId: firstLocationId,
          },
        },
      }),
    ).toMatchObject({ onHand: 5, allocated: 1 });
    expect(
      await prisma.stockLedgerEntry.count({
        where: { variantId: fixture.variantId, reason: 'FULFILMENT' },
      }),
    ).toBe(0);
    expect(await prisma.trackingEvent.count({ where: { shipmentId: draft.id } })).toBe(0);
  }, 30_000);

  it('dispatches a concurrently submitted shipment only once', async () => {
    const fixture = await seedOrder([{ locationId: firstLocationId, quantity: 2, onHand: 5 }]);
    const draft = await fulfilment.createShipment(staff, shipmentInput(fixture, 2), {
      requestId: randomUUID(),
    });
    const outcomes = await Promise.all([
      fulfilment.markShipped(staff, draft.id, { requestId: randomUUID() }),
      fulfilment.markShipped(staff, draft.id, { requestId: randomUUID() }),
    ]);
    expect(outcomes.map((row) => row.status)).toEqual(['IN_TRANSIT', 'IN_TRANSIT']);
    expect(
      await prisma.stockLedgerEntry.count({
        where: { variantId: fixture.variantId, reason: 'FULFILMENT', refId: draft.id },
      }),
    ).toBe(1);
    expect(await prisma.trackingEvent.count({ where: { shipmentId: draft.id } })).toBe(1);
    expect(
      await prisma.inventoryItem.findUniqueOrThrow({
        where: {
          variantId_stockLocationId: {
            variantId: fixture.variantId,
            stockLocationId: firstLocationId,
          },
        },
      }),
    ).toMatchObject({ onHand: 3, allocated: 0 });
  }, 30_000);

  it('releases allocation on cancellation before any shipment and leaves physical stock in place', async () => {
    const fixture = await seedOrder([
      { locationId: firstLocationId, quantity: 2, onHand: 7 },
      { locationId: secondLocationId, quantity: 1, onHand: 5 },
    ]);
    await fulfilment.cancelBeforeShipment(staff, fixture.orderId, { requestId: randomUUID() });
    expect(await prisma.order.findUniqueOrThrow({ where: { id: fixture.orderId } })).toMatchObject({
      status: 'CANCELLED',
      fulfilmentStatus: 'UNFULFILLED',
    });
    const items = await prisma.inventoryItem.findMany({ where: { variantId: fixture.variantId } });
    expect(items.map((item) => [item.onHand, item.allocated, item.reserved]).sort()).toEqual(
      [
        [7, 0, 0],
        [5, 0, 0],
      ].sort(),
    );
    expect(
      await prisma.stockLedgerEntry.count({
        where: { variantId: fixture.variantId, reason: 'ALLOCATION_RELEASE' },
      }),
    ).toBe(2);
    expect(
      await prisma.stockLedgerEntry.count({
        where: { variantId: fixture.variantId, reason: 'FULFILMENT' },
      }),
    ).toBe(0);
    await expect(
      fulfilment.createShipment(staff, shipmentInput(fixture, 1), { requestId: randomUUID() }),
    ).rejects.toMatchObject({ code: 'ORDER_NOT_FULFILLABLE' });
  }, 30_000);

  it('serializes draft creation against cancellation and refuses to release claimed allocation', async () => {
    const fixture = await seedOrder([{ locationId: firstLocationId, quantity: 2, onHand: 5 }]);
    const blocking = new BlockingProvider();
    const concurrent = serviceWithProvider(blocking);
    const draftPromise = concurrent.createShipment(staff, shipmentInput(fixture, 2), {
      requestId: randomUUID(),
    });
    await blocking.entered;
    const cancellation = concurrent.cancelBeforeShipment(staff, fixture.orderId, {
      requestId: randomUUID(),
    });
    blocking.release();
    const outcomes = await Promise.allSettled([draftPromise, cancellation]);
    expect(outcomes[0]?.status).toBe('fulfilled');
    expect(outcomes[1]).toMatchObject({
      status: 'rejected',
      reason: { code: 'SHIPMENT_EXISTS' },
    });
    expect(await prisma.shipment.count({ where: { orderId: fixture.orderId } })).toBe(1);
    expect(await prisma.order.findUniqueOrThrow({ where: { id: fixture.orderId } })).toMatchObject({
      status: 'PAID',
    });
    expect(
      await prisma.inventoryItem.findUniqueOrThrow({
        where: {
          variantId_stockLocationId: {
            variantId: fixture.variantId,
            stockLocationId: firstLocationId,
          },
        },
      }),
    ).toMatchObject({ onHand: 5, allocated: 2 });
  }, 30_000);

  it('rejects unpaid orders and unauthorized principals without creating shipments or stock movement', async () => {
    const fixture = await seedOrder(
      [{ locationId: firstLocationId, quantity: 1, onHand: 2 }],
      'UNPAID',
    );
    await expect(
      fulfilment.createShipment(staff, shipmentInput(fixture, 1), { requestId: randomUUID() }),
    ).rejects.toMatchObject({ code: 'ORDER_NOT_FULFILLABLE' });
    await expect(
      fulfilment.createShipment({ ...staff, kind: 'CUSTOMER' }, shipmentInput(fixture, 1), {
        requestId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'STAFF_REQUIRED' });
    expect(await prisma.shipment.count({ where: { orderId: fixture.orderId } })).toBe(0);
    expect(
      await prisma.stockLedgerEntry.count({
        where: { variantId: fixture.variantId, reason: 'FULFILMENT' },
      }),
    ).toBe(0);
  }, 30_000);
});
