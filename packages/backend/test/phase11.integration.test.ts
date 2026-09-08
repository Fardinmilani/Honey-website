import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { createPrismaClient, type PrismaClient } from '@honey/db';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ConflictAppError } from '../src/errors/index.js';
import type { AuthenticatedPrincipal } from '../src/modules/identity/index.js';
import { InventoryService } from '../src/modules/inventory/application/inventory.service.js';
import { IncomingProjectionBinder } from '../src/modules/inventory/domain/inventory.js';
import { PrismaInventoryRepository } from '../src/modules/inventory/infrastructure/prisma-inventory.repository.js';
import { ProcurementService } from '../src/modules/procurement/application/procurement.service.js';
import { PrismaProcurementRepository } from '../src/modules/procurement/infrastructure/prisma-procurement.repository.js';
import { SourcingService } from '../src/modules/sourcing/application/sourcing.service.js';
import { PrismaSourcingRepository } from '../src/modules/sourcing/infrastructure/prisma-sourcing.repository.js';

const execFileAsync = promisify(execFile);
const dbDirectory = fileURLToPath(new URL('../../db/', import.meta.url));
const prismaCli = fileURLToPath(
  new URL('../../db/node_modules/prisma/build/index.js', import.meta.url),
);

type TemporaryDatabase = Readonly<{ adminUrl: string; databaseName: string; databaseUrl: string }>;

async function createTemporaryDatabase(): Promise<TemporaryDatabase> {
  const base = new URL(
    process.env['DATABASE_URL'] ??
      'postgresql://honey_local:replace-with-local-development-password@127.0.0.1:5432/honey_local',
  );
  const databaseName = `honey_phase11_${randomUUID().replaceAll('-', '')}`;
  if (!/^honey_phase11_[a-f0-9]{32}$/u.test(databaseName)) throw new Error('Unsafe database name.');
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

describe('Phase 11 sourcing, procurement, and inventory on PostgreSQL', () => {
  let database: TemporaryDatabase;
  let prisma: PrismaClient;
  let inventory: InventoryService;
  let procurement: ProcurementService;
  let sourcing: SourcingService;
  let inventoryRepository: PrismaInventoryRepository;
  let procurementRepository: PrismaProcurementRepository;
  let sourcingRepository: PrismaSourcingRepository;
  const actorId = '018f0000-0000-7000-8000-0000000000e1';
  const principal: AuthenticatedPrincipal = {
    userId: actorId,
    sessionId: '018f0000-0000-7000-8000-0000000000e2',
    kind: 'STAFF',
    permissions: ['inventory:read', 'inventory:adjust', 'procurement:read', 'procurement:write'],
  };
  const metadata = { requestId: 'phase11-integration', clientIp: '192.0.2.21' } as const;
  let locationId = '';
  let studioId = '';
  let variantId = '';
  let supplierId = '';
  let supplierBatchId = '';
  let ownBatchId = '';
  let allocationId = '';

  beforeAll(async () => {
    database = await createTemporaryDatabase();
    await migrate(database.databaseUrl);
    prisma = createPrismaClient({ databaseUrl: database.databaseUrl });
    await prisma.user.create({
      data: {
        id: actorId,
        email: 'inventory-staff@example.invalid',
        preferredLocale: 'fa',
        isStaff: true,
      },
    });
    inventoryRepository = new PrismaInventoryRepository(database.databaseUrl);
    const incoming = new IncomingProjectionBinder();
    inventory = new InventoryService(inventoryRepository, incoming);
    procurementRepository = new PrismaProcurementRepository(database.databaseUrl);
    procurement = new ProcurementService(procurementRepository, inventory);
    incoming.bind(procurement);
    sourcingRepository = new PrismaSourcingRepository(database.databaseUrl);
    sourcing = new SourcingService(sourcingRepository, inventory);

    const location = await inventory.createLocation(
      principal,
      {
        code: 'WH-1',
        name: 'Warehouse one',
        type: 'WAREHOUSE',
        isSellable: true,
        isDefault: true,
      },
      metadata,
    );
    locationId = location.id;
    const studio = await inventory.createLocation(
      principal,
      {
        code: 'ST-1',
        name: 'Studio hold',
        type: 'STUDIO',
        isSellable: false,
        isDefault: false,
      },
      metadata,
    );
    studioId = studio.id;

    const product = await prisma.product.create({
      data: {
        id: randomUUID(),
        sourcingType: 'OWN_PRODUCTION',
        status: 'PUBLISHED',
        sku: 'PHASE11-PRODUCT',
      },
    });
    const variant = await prisma.productVariant.create({
      data: {
        id: randomUUID(),
        productId: product.id,
        sku: 'PHASE11-VAR-450',
        netWeightGrams: 450,
        jarSizeLabelKey: 'jar.450g',
        packagingTypeKey: 'packaging.glass',
        weightGramsShipping: 700,
        dimensionsMm: [85, 85, 120],
        isDefault: true,
        status: 'PUBLISHED',
      },
    });
    variantId = variant.id;

    const supplier = await procurement.createSupplier(
      principal,
      {
        code: 'SUP-INT',
        legalName: 'Internal Fixture Supply',
        contactName: null,
        email: null,
        phone: null,
        address: null,
        status: 'ACTIVE',
        qualityRating: 4,
        notes: null,
      },
      metadata,
    );
    supplierId = supplier.id;

    const apiary = await sourcing.createApiary(
      principal,
      {
        code: 'API-INT',
        name: 'Test apiary',
        region: 'Azerbaijan',
        isOwnOperation: true,
      },
      metadata,
    );
    const ownBatch = await sourcing.createHarvestBatch(
      principal,
      {
        batchCode: 'OWN-INT-001',
        sourcingType: 'OWN_PRODUCTION',
        apiaryId: apiary.id,
        harvestSeason: 'spring',
        harvestYear: 2026,
        floralSources: ['wildflower'],
        quantityGrams: 10000,
      },
      metadata,
    );
    ownBatchId = ownBatch.id;
    const supplierBatch = await sourcing.createHarvestBatch(
      principal,
      {
        batchCode: 'SUP-INT-001',
        sourcingType: 'SELECTED_SUPPLIER',
        supplierId,
        harvestSeason: 'summer',
        harvestYear: 2026,
        floralSources: ['thyme'],
        quantityGrams: 8000,
      },
      metadata,
    );
    supplierBatchId = supplierBatch.id;
    const allocation = await sourcing.createAllocation(
      principal,
      {
        harvestBatchId: ownBatchId,
        variantId,
        quantityUnits: 40,
        packedAt: new Date('2026-08-10T00:00:00.000Z').toISOString(),
      },
      metadata,
    );
    allocationId = allocation.id;
  }, 120_000);

  afterAll(async () => {
    await inventoryRepository?.close();
    await procurementRepository?.close();
    await sourcingRepository?.close();
    await prisma?.$disconnect();
    if (database !== undefined) await dropTemporaryDatabase(database);
  });

  it('rejects invalid own-production and selected-supplier harvest batch shapes at the database', async () => {
    await expect(
      prisma.harvestBatch.create({
        data: {
          id: randomUUID(),
          batchCode: 'BAD-OWN',
          sourcingType: 'OWN_PRODUCTION',
          supplierId,
          harvestSeason: 'spring',
          harvestYear: 2026,
          quantityGrams: 1,
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.harvestBatch.create({
        data: {
          id: randomUUID(),
          batchCode: 'BAD-SUP',
          sourcingType: 'SELECTED_SUPPLIER',
          harvestSeason: 'summer',
          harvestYear: 2026,
          quantityGrams: 1,
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects UPDATE and DELETE against the append-only stock ledger', async () => {
    await sourcing.intakeProduction(
      principal,
      {
        allocationId,
        stockLocationId: locationId,
        quantity: 4,
        note: 'baseline intake',
      },
      metadata,
    );
    const entry = await prisma.stockLedgerEntry.findFirst({
      where: { variantId, stockLocationId: locationId },
    });
    if (entry === null) throw new Error('Expected a ledger row.');
    await expect(
      prisma.stockLedgerEntry.update({ where: { id: entry.id }, data: { note: 'tamper' } }),
    ).rejects.toThrow();
    await expect(prisma.stockLedgerEntry.delete({ where: { id: entry.id } })).rejects.toThrow();
  });

  it('receives supplier goods atomically, ignores rejected quantity for on-hand, and is idempotent', async () => {
    const order = await procurement.createPurchaseOrder(
      principal,
      {
        number: `PO-${randomUUID().slice(0, 8)}`,
        supplierId,
        currency: 'IRR',
        expectedAt: null,
        notes: null,
        destinationStockLocationId: locationId,
        freightCostMinor: 10n,
        dutyCostMinor: 0n,
        otherCostMinor: 0n,
        lines: [
          {
            description: 'Thyme jars',
            variantId,
            harvestBatchId: supplierBatchId,
            quantityOrdered: 10,
            unitCostMinor: 100n,
            taxMinor: 0n,
          },
        ],
      },
      metadata,
    );
    await procurement.transitionPurchaseOrder(principal, order.id, 'SUBMITTED', metadata);
    const confirmed = await procurement.transitionPurchaseOrder(
      principal,
      order.id,
      'CONFIRMED',
      metadata,
    );
    expect(confirmed.status).toBe('CONFIRMED');
    const before = await inventory.getItem(principal, variantId, locationId);
    const incomingBefore = before.incoming;
    const onHandBefore = before.onHand;
    const body = {
      stockLocationId: locationId,
      lines: [
        {
          purchaseOrderLineId: confirmed.lines[0]?.id ?? '',
          quantityAccepted: 6,
          quantityRejected: 1,
          rejectionReason: 'jar chip',
          harvestBatchId: supplierBatchId,
        },
      ],
    };
    const key = `idempotency-key-${randomUUID()}`;
    const first = await procurement.receiveGoods(
      principal,
      order.id,
      { ...body, idempotencyKey: key },
      metadata,
    );
    expect(first.replayed).toBe(false);
    const replay = await procurement.receiveGoods(
      principal,
      order.id,
      { ...body, idempotencyKey: key },
      metadata,
    );
    expect(replay.replayed).toBe(true);
    expect(replay.receipt.id).toBe(first.receipt.id);
    await expect(
      procurement.receiveGoods(
        principal,
        order.id,
        {
          ...body,
          notes: 'different body',
          idempotencyKey: key,
        },
        metadata,
      ),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSE' });
    const after = await inventory.getItem(principal, variantId, locationId);
    expect(after.onHand).toBe(onHandBefore + 6);
    expect(after.incoming).toBe(incomingBefore - 7);
    const ledger = await prisma.stockLedgerEntry.findMany({
      where: { refType: 'goods_receipt', refId: first.receipt.id },
    });
    expect(ledger).toHaveLength(1);
    expect(ledger[0]?.delta).toBe(6);
    const partial = await procurement.getPurchaseOrder(principal, order.id);
    expect(partial.status).toBe('PARTIALLY_RECEIVED');
  });

  it('does not let concurrent receipts exceed the remaining purchase-order quantity', async () => {
    const order = await procurement.createPurchaseOrder(
      principal,
      {
        number: `PO-${randomUUID().slice(0, 8)}`,
        supplierId,
        currency: 'IRR',
        expectedAt: null,
        notes: null,
        destinationStockLocationId: locationId,
        freightCostMinor: 0n,
        dutyCostMinor: 0n,
        otherCostMinor: 0n,
        lines: [
          {
            description: 'Last units',
            variantId,
            harvestBatchId: supplierBatchId,
            quantityOrdered: 2,
            unitCostMinor: 50n,
            taxMinor: 0n,
          },
        ],
      },
      metadata,
    );
    await procurement.transitionPurchaseOrder(principal, order.id, 'SUBMITTED', metadata);
    await procurement.transitionPurchaseOrder(principal, order.id, 'CONFIRMED', metadata);
    const lineId = (await procurement.getPurchaseOrder(principal, order.id)).lines[0]?.id;
    if (lineId === undefined) throw new Error('Missing purchase-order line.');
    const payload = {
      stockLocationId: locationId,
      lines: [
        {
          purchaseOrderLineId: lineId,
          quantityAccepted: 2,
          quantityRejected: 0,
          harvestBatchId: supplierBatchId,
        },
      ],
    };
    const results = await Promise.allSettled([
      procurement.receiveGoods(
        principal,
        order.id,
        { ...payload, idempotencyKey: `concurrent-a-${randomUUID()}` },
        metadata,
      ),
      procurement.receiveGoods(
        principal,
        order.id,
        { ...payload, idempotencyKey: `concurrent-b-${randomUUID()}` },
        metadata,
      ),
    ]);
    const accepted = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(accepted).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const failure = rejected[0];
    if (failure === undefined || failure.status !== 'rejected')
      throw new Error('Expected rejection.');
    if (!(failure.reason instanceof ConflictAppError)) {
      throw new Error('Expected OVER_RECEIPT conflict.');
    }
    expect(failure.reason.code).toBe('OVER_RECEIPT');
    const final = await procurement.getPurchaseOrder(principal, order.id);
    expect(final.status).toBe('RECEIVED');
    expect(
      final.lines[0] !== undefined
        ? final.lines[0].quantityReceivedAccepted + final.lines[0].quantityReceivedRejected
        : 0,
    ).toBe(2);
  });

  it('rolls back receipt, ledger, and inventory together when incoming accounting fails', async () => {
    const product = await prisma.product.create({
      data: {
        id: randomUUID(),
        sourcingType: 'SELECTED_SUPPLIER',
        sku: `SKU-${randomUUID().slice(0, 8)}`,
      },
    });
    const variant = await prisma.productVariant.create({
      data: {
        id: randomUUID(),
        productId: product.id,
        sku: `VAR-${randomUUID().slice(0, 8)}`,
        netWeightGrams: 450,
        jarSizeLabelKey: 'jar.450g',
        packagingTypeKey: 'packaging.glass',
        weightGramsShipping: 700,
        dimensionsMm: [85, 85, 120],
      },
    });
    const order = await prisma.purchaseOrder.create({
      data: {
        id: randomUUID(),
        number: `PO-RAW-${randomUUID().slice(0, 8)}`,
        supplierId,
        status: 'CONFIRMED',
        currency: 'IRR',
        destinationStockLocationId: locationId,
        lines: {
          create: {
            id: randomUUID(),
            description: 'Unaccounted incoming',
            variantId: variant.id,
            harvestBatchId: supplierBatchId,
            quantityOrdered: 3,
            unitCostMinor: 10n,
            taxMinor: 0n,
            lineTotalMinor: 30n,
          },
        },
      },
      include: { lines: true },
    });
    const lineId = order.lines[0]?.id;
    if (lineId === undefined) throw new Error('Missing line.');
    const receiptsBefore = await prisma.goodsReceipt.count();
    const ledgerBefore = await prisma.stockLedgerEntry.count();
    await expect(
      procurement.receiveGoods(
        principal,
        order.id,
        {
          stockLocationId: locationId,
          lines: [
            {
              purchaseOrderLineId: lineId,
              quantityAccepted: 1,
              quantityRejected: 0,
              harvestBatchId: supplierBatchId,
            },
          ],
          idempotencyKey: `rollback-${randomUUID()}`,
        },
        metadata,
      ),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
    expect(await prisma.goodsReceipt.count()).toBe(receiptsBefore);
    expect(await prisma.stockLedgerEntry.count()).toBe(ledgerBefore);
    expect(
      await prisma.inventoryItem.findUnique({
        where: {
          variantId_stockLocationId: { variantId: variant.id, stockLocationId: locationId },
        },
      }),
    ).toBeNull();
  });

  it('rejects concurrent decrements that would go negative and does not lose concurrent increments', async () => {
    await inventory.adjust(
      principal,
      {
        variantId,
        stockLocationId: locationId,
        delta: 2,
        reason: 'ADJUSTMENT',
        note: 'set two units for decrement race',
      },
      metadata,
    );
    const item = await inventory.getItem(principal, variantId, locationId);
    const start = item.onHand;
    await inventory.adjust(
      principal,
      {
        variantId,
        stockLocationId: locationId,
        delta: -start + 1,
        reason: 'ADJUSTMENT',
        note: 'leave one unit',
      },
      metadata,
    );
    const lastUnit = await Promise.allSettled([
      inventory.adjust(
        principal,
        {
          variantId,
          stockLocationId: locationId,
          delta: -1,
          reason: 'WRITE_OFF',
          note: 'race a',
        },
        metadata,
      ),
      inventory.adjust(
        principal,
        {
          variantId,
          stockLocationId: locationId,
          delta: -1,
          reason: 'WRITE_OFF',
          note: 'race b',
        },
        metadata,
      ),
    ]);
    expect(lastUnit.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(lastUnit.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const afterLast = await inventory.getItem(principal, variantId, locationId);
    expect(afterLast.onHand).toBe(0);

    const increment = await Promise.all([
      inventory.adjust(
        principal,
        {
          variantId,
          stockLocationId: locationId,
          delta: 1,
          reason: 'CORRECTION',
          note: 'inc a',
        },
        metadata,
      ),
      inventory.adjust(
        principal,
        {
          variantId,
          stockLocationId: locationId,
          delta: 1,
          reason: 'CORRECTION',
          note: 'inc b',
        },
        metadata,
      ),
    ]);
    expect(increment.map((row) => row.onHand).sort((left, right) => left - right)).toEqual([1, 2]);
    const afterInc = await inventory.getItem(principal, variantId, locationId);
    expect(afterInc.onHand).toBe(2);
  });

  it('computes public bands from sellable locations only and latches low-stock events', async () => {
    const isolated = await prisma.productVariant.create({
      data: {
        id: randomUUID(),
        productId: (
          await prisma.product.create({
            data: {
              id: randomUUID(),
              sourcingType: 'OWN_PRODUCTION',
              sku: `ISO-${randomUUID().slice(0, 8)}`,
            },
          })
        ).id,
        sku: `ISO-VAR-${randomUUID().slice(0, 8)}`,
        netWeightGrams: 450,
        jarSizeLabelKey: 'jar.450g',
        packagingTypeKey: 'packaging.glass',
        weightGramsShipping: 700,
        dimensionsMm: [85, 85, 120],
      },
    });
    await inventory.adjust(
      principal,
      {
        variantId: isolated.id,
        stockLocationId: locationId,
        delta: 12,
        reason: 'ADJUSTMENT',
        note: 'sellable twelve',
      },
      metadata,
    );
    await inventory.setPlanning(principal, isolated.id, locationId, { reorderPoint: 10 }, metadata);
    await inventory.adjust(
      principal,
      {
        variantId: isolated.id,
        stockLocationId: studioId,
        delta: 50,
        reason: 'ADJUSTMENT',
        note: 'non-sellable hold',
      },
      metadata,
    );
    const snapshots = await inventory.availabilityForVariants([isolated.id]);
    expect(snapshots[0]?.availableToSell).toBe(12);
    expect(snapshots[0]?.band).toBe('IN_STOCK');
    await inventory.adjust(
      principal,
      {
        variantId: isolated.id,
        stockLocationId: locationId,
        delta: -3,
        reason: 'ADJUSTMENT',
        note: 'cross into low',
      },
      metadata,
    );
    const low = await inventory.availabilityForVariants([isolated.id]);
    expect(low[0]?.band).toBe('LOW_STOCK');
    const events = await prisma.outboxEvent.findMany({
      where: { aggregateId: isolated.id, eventType: 'stock.low' },
    });
    expect(events).toHaveLength(1);
    await inventory.adjust(
      principal,
      {
        variantId: isolated.id,
        stockLocationId: locationId,
        delta: -1,
        reason: 'ADJUSTMENT',
        note: 'still low',
      },
      metadata,
    );
    expect(
      await prisma.outboxEvent.count({
        where: { aggregateId: isolated.id, eventType: 'stock.low' },
      }),
    ).toBe(1);
  });

  it('detects ledger drift and repairs InventoryItem when asked', async () => {
    const item = await inventory.getItem(principal, variantId, locationId);
    await prisma.inventoryItem.update({
      where: { id: item.id },
      data: { onHand: item.onHand + 9 },
    });
    const report = await inventory.reconcile(principal, metadata, false);
    expect(report.drifted).toBe(true);
    expect(report.repaired).toBe(false);
    expect(
      report.drifts.some((drift) => drift.field === 'onHand' && drift.variantId === variantId),
    ).toBe(true);
    const repaired = await inventory.reconcile(principal, metadata, true);
    expect(repaired.repaired).toBe(true);
    const restored = await inventory.getItem(principal, variantId, locationId);
    expect(restored.onHand).toBe(item.onHand);
    const second = await inventory.reconcile(principal, metadata, true);
    expect(second.drifted).toBe(false);
  });
});
