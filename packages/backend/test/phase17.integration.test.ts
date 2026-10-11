import { randomUUID } from 'node:crypto';
import { createPrismaClient, type PrismaClient } from '@honey/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AdminCatalogService,
  AdminIdentityService,
  AdminOrdersService,
  AdminPricingService,
  type AuthenticatedPrincipal,
} from '../src/index.js';
import { PrismaAdminCatalogRepository } from '../src/modules/catalog/infrastructure/prisma-admin-catalog.repository.js';
import { PrismaAdminIdentityRepository } from '../src/modules/identity/infrastructure/prisma-admin-identity.repository.js';
import { PrismaAuditWriter } from '../src/modules/identity/infrastructure/prisma-audit.writer.js';
import { PrismaAdminMediaRepository } from '../src/modules/media/infrastructure/prisma-admin-media.repository.js';
import { PrismaAdminOrdersRepository } from '../src/modules/orders/infrastructure/prisma-admin-orders.repository.js';
import { PrismaAdminPricingRepository } from '../src/modules/pricing/infrastructure/prisma-admin-pricing.repository.js';
import { PrismaPlatformAdapter } from '../src/platform/infrastructure/prisma-platform.adapter.js';
import { PrismaShippingSettingsRepository } from '../src/modules/shipping/infrastructure/prisma-shipping-settings.repository.js';
import {
  createAdminTestDatabase,
  dropAdminTestDatabase,
  type AdminTestDatabase,
} from './helpers/admin-test-database.js';

describe('Phase 17 owned admin seams on PostgreSQL', () => {
  let database: AdminTestDatabase;
  let prisma: PrismaClient;
  let catalogRepository: PrismaAdminCatalogRepository;
  let identityRepository: PrismaAdminIdentityRepository;
  let ordersRepository: PrismaAdminOrdersRepository;
  let pricingRepository: PrismaAdminPricingRepository;
  let mediaRepository: PrismaAdminMediaRepository;
  let shippingRepository: PrismaShippingSettingsRepository;
  let audit: PrismaAuditWriter;
  let platform: PrismaPlatformAdapter;
  let orders: AdminOrdersService;
  let identity: AdminIdentityService;
  let pricing: AdminPricingService;
  let staff: AuthenticatedPrincipal;
  const customerId = randomUUID();
  const orderId = randomUUID();
  const couponId = randomUUID();
  const taxId = randomUUID();
  const metadata = {
    requestId: 'phase17-integration',
    clientIp: '192.0.2.17',
    userAgent: 'phase17-integration',
  };
  beforeAll(async () => {
    database = await createAdminTestDatabase();
    prisma = createPrismaClient({ databaseUrl: database.databaseUrl });
    const actor = await prisma.user.create({
      data: { id: randomUUID(), email: 'staff-phase17@example.invalid', isStaff: true },
    });
    staff = {
      userId: actor.id,
      sessionId: randomUUID(),
      kind: 'STAFF',
      permissions: [
        'catalog:read',
        'order:read',
        'order:note',
        'customer:read',
        'audit:read',
        'pricing:read',
        'pricing:write',
      ],
    };
    await prisma.user.create({
      data: {
        id: customerId,
        email: 'customer-phase17@example.invalid',
        phone: '+989120001234',
        displayName: 'Customer fixture',
      },
    });
    await prisma.order.create({
      data: {
        id: orderId,
        number: 'HNY-PHASE17-1001',
        userId: customerId,
        email: 'customer-phase17@example.invalid',
        localeAtPurchase: 'fa',
        currency: 'IRR',
        status: 'PAID',
        paymentStatus: 'PAID',
        subtotalMinor: 1000n,
        grandTotalMinor: 1000n,
        shippingAddressSnapshot: { city: 'Tehran' },
        billingAddressSnapshot: {},
        shippingMethodSnapshot: { methodCode: 'STANDARD' },
      },
    });
    for (const status of ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const)
      await prisma.product.create({
        data: {
          id: randomUUID(),
          sku: `PH17-${status}`,
          status,
          sourcingType: 'OWN_PRODUCTION',
          translations: {
            create: [
              {
                id: randomUUID(),
                locale: 'fa',
                name: `محصول ${status}`,
                slug: `ph17-fa-${status.toLowerCase()}`,
              },
              {
                id: randomUUID(),
                locale: 'en',
                name: `Product ${status}`,
                slug: `ph17-en-${status.toLowerCase()}`,
              },
            ],
          },
        },
      });
    await prisma.coupon.create({
      data: {
        id: couponId,
        code: 'PHASE17',
        type: 'PERCENT',
        value: 500n,
        startsAt: new Date(),
        status: 'DRAFT',
      },
    });
    await prisma.taxRate.create({
      data: {
        id: taxId,
        code: 'PHASE17',
        name: 'PHASE17',
        country: 'IR',
        rateBps: 900,
        isInclusive: false,
        isActive: true,
      },
    });
    for (let index = 0; index < 3; index += 1)
      await prisma.mediaAsset.create({
        data: {
          id: randomUUID(),
          kind: 'IMAGE',
          visibility: index === 0 ? 'PRIVATE' : 'PUBLIC',
          storageKey: `${index === 0 ? 'private' : 'media'}/phase17/image-${index}.png`,
          mimeType: 'image/png',
          bytes: 128n,
          width: 16,
          height: 16,
          checksum: String(index).repeat(64),
        },
      });
    catalogRepository = new PrismaAdminCatalogRepository(database.databaseUrl);
    identityRepository = new PrismaAdminIdentityRepository(database.databaseUrl);
    ordersRepository = new PrismaAdminOrdersRepository(database.databaseUrl);
    pricingRepository = new PrismaAdminPricingRepository(database.databaseUrl);
    mediaRepository = new PrismaAdminMediaRepository(database.databaseUrl);
    shippingRepository = new PrismaShippingSettingsRepository(database.databaseUrl);
    audit = new PrismaAuditWriter(database.databaseUrl);
    platform = new PrismaPlatformAdapter(database.databaseUrl);
    orders = new AdminOrdersService(ordersRepository, audit, platform);
    identity = new AdminIdentityService(identityRepository, audit);
    pricing = new AdminPricingService(pricingRepository, audit, platform);
  }, 150_000);
  afterAll(async () => {
    await Promise.allSettled([
      catalogRepository?.close(),
      identityRepository?.close(),
      ordersRepository?.close(),
      pricingRepository?.close(),
      mediaRepository?.close(),
      shippingRepository?.close(),
      audit?.close(),
      platform?.close(),
      prisma?.$disconnect(),
    ]);
    if (database !== undefined) await dropAdminTestDatabase(database);
  });
  it('pages every publication state without duplicate records and includes both translations', async () => {
    const catalog = new AdminCatalogService(catalogRepository);
    const first = await catalog.products(staff, { limit: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();
    if (first.nextCursor === null) throw new Error('Missing expected cursor.');
    const second = await catalog.products(staff, { limit: 2, cursor: first.nextCursor });
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    const rows = [...first.items, ...second.items];
    expect(new Set(rows.map((row) => row.id)).size).toBe(3);
    expect(rows.map((row) => row.status).sort()).toEqual(['ARCHIVED', 'DRAFT', 'PUBLISHED']);
    for (const row of rows)
      expect(row.translations.map((entry) => entry.locale).sort()).toEqual(['en', 'fa']);
    expect((await catalog.products(staff, { status: 'DRAFT', q: 'PH17' })).items).toHaveLength(1);
    expect(() => catalog.products({ ...staff, kind: 'CUSTOMER' }, {})).toThrow();
    expect(() => catalog.products(staff, { limit: 101 })).toThrow();
  });
  it('stores internal notes with an atomic audit and rolls back when the audit cannot persist', async () => {
    const support = {
      ...staff,
      permissions: ['order:read', 'order:note', 'customer:read'] as const,
    };
    const note = await orders.addNote(support, orderId, '  Follow-up note  ', metadata);
    expect(note.body).toBe('Follow-up note');
    expect(await prisma.orderNote.findUnique({ where: { id: note.id } })).toMatchObject({
      isCustomerVisible: false,
      authorUserId: staff.userId,
    });
    expect(
      await prisma.auditLog.findFirst({
        where: { action: 'order.note_added', subjectId: orderId },
      }),
    ).toMatchObject({ afterJson: { noteId: note.id }, requestId: metadata.requestId });
    const count = await prisma.orderNote.count();
    const failing = new AdminOrdersService(
      ordersRepository,
      {
        appendAudit: async () => {
          throw new Error('Audit unavailable');
        },
      },
      platform,
    );
    await expect(failing.addNote(support, orderId, 'Rollback this note', metadata)).rejects.toThrow(
      'Audit unavailable',
    );
    expect(await prisma.orderNote.count()).toBe(count);
    await expect(
      orders.addNote({ ...staff, permissions: ['order:read'] }, orderId, 'Denied', metadata),
    ).rejects.toMatchObject({ statusIntent: 'forbidden' });
    await expect(
      orders.addNote(support, randomUUID(), 'Missing order', metadata),
    ).rejects.toMatchObject({ statusIntent: 'not-found' });
    expect((await orders.detail(staff, orderId)).grandTotalMinor).toBe('1000');
  });
  it('performs exact audited customer lookup and returns no credentials, sessions or raw audit data', async () => {
    const result = await identity.customers(
      staff,
      { q: ' CUSTOMER-PHASE17@EXAMPLE.INVALID ' },
      metadata,
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ id: customerId, phoneMasked: '••••1234' });
    expect(Object.keys(result.items[0] ?? {}).sort()).toEqual([
      'createdAt',
      'displayName',
      'email',
      'emailVerified',
      'id',
      'phoneMasked',
      'preferredLocale',
      'status',
    ]);
    expect(
      (await identity.customers(staff, { q: 'staff-phase17@example.invalid' }, metadata)).items,
    ).toHaveLength(0);
    await prisma.auditLog.create({
      data: {
        id: randomUUID(),
        actorUserId: staff.userId,
        action: 'fixture.privacy',
        subjectType: 'User',
        subjectId: customerId,
        beforeJson: { forbiddenPrivateMarker: 'redact-this' },
        ip: '192.0.2.17',
      },
    });
    const entries = await identity.audit(staff, { action: 'fixture.privacy' });
    expect(entries.items).toHaveLength(1);
    expect(JSON.stringify(entries)).not.toContain('forbiddenPrivateMarker');
    expect(JSON.stringify(entries)).not.toContain('192.0.2.17');
    const lookup = await prisma.auditLog.findFirst({ where: { action: 'customer.lookup' } });
    expect(lookup?.afterJson).toHaveProperty('count');
    expect(JSON.stringify(lookup?.afterJson)).not.toContain('example.invalid');
    await expect(identity.customers(staff, { q: 'not-an-email' }, metadata)).rejects.toMatchObject({
      statusIntent: 'unprocessable-entity',
    });
  });
  it('uses optimistic coupon status writes and audits one winner under concurrency', async () => {
    const results = await Promise.allSettled([
      pricing.setCouponStatus(staff, couponId, 'DRAFT', 'ACTIVE', metadata),
      pricing.setCouponStatus(staff, couponId, 'DRAFT', 'PAUSED', metadata),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(
      await prisma.auditLog.count({
        where: { action: 'pricing.coupon.status_changed', subjectId: couponId },
      }),
    ).toBe(1);
    const updated = await pricing.updateTax(
      staff,
      {
        id: taxId,
        code: 'PHASE17',
        country: 'IR',
        region: null,
        rateBps: 1000,
        isInclusive: false,
        isActive: true,
      },
      metadata,
    );
    expect(updated.rateBps).toBe(1000);
    expect(await prisma.taxRate.findUnique({ where: { id: taxId } })).toMatchObject({
      rateBps: 1000,
      updatedBy: staff.userId,
    });
    expect(
      await prisma.auditLog.count({
        where: { action: 'pricing.tax_rate.updated', subjectId: taxId },
      }),
    ).toBe(1);
  });
  it('bounds the media library and preserves visibility filters', async () => {
    const first = await mediaRepository.list({ limit: 1 });
    expect(first.items).toHaveLength(1);
    expect(first.nextCursor).not.toBeNull();
    expect((await mediaRepository.list({ visibility: 'PRIVATE', limit: 10 })).items).toHaveLength(
      1,
    );
    expect((await mediaRepository.list({ visibility: 'PUBLIC', limit: 10 })).items).toHaveLength(2);
  });
  it('persists shipping zones, methods and rates with their audit under the transaction lock', async () => {
    const zoneId = randomUUID();
    const methodId = randomUUID();
    const rateId = randomUUID();
    const actor = {
      actorUserId: staff.userId,
      requestId: metadata.requestId,
      clientIp: metadata.clientIp,
    };
    const zone = {
      id: zoneId,
      name: 'Admin shipping zone',
      countries: ['IR'],
      provinces: [],
      priority: 1,
    };
    await shippingRepository.upsertZone(zone, actor);
    await expect(
      shippingRepository.upsertZone({ ...zone, id: randomUUID() }, actor),
    ).rejects.toMatchObject({ statusIntent: 'unprocessable-entity' });
    await shippingRepository.upsertMethod(
      {
        id: methodId,
        zoneId,
        code: 'PHASE17',
        isActive: true,
        sortOrder: 0,
        translations: [
          { locale: 'en', name: 'Admin delivery', description: null },
          { locale: 'fa', name: 'ارسال آزمون', description: null },
        ],
      },
      actor,
    );
    const rate = {
      id: rateId,
      methodId,
      currency: 'IRR',
      baseMinor: 5000n,
      perKgMinor: 1000n,
      freeOverSubtotalMinor: null,
      minWeightGrams: 0,
      maxWeightGrams: null,
      validFrom: new Date('2026-01-01T00:00:00Z'),
      validTo: null,
    };
    await shippingRepository.upsertRate(rate, actor);
    await expect(
      shippingRepository.upsertRate({ ...rate, id: randomUUID() }, actor),
    ).rejects.toMatchObject({ statusIntent: 'unprocessable-entity' });
    expect(
      (await shippingRepository.list()).zones.find((entry) => entry.id === zoneId)?.methods[0]
        ?.rates[0],
    ).toMatchObject({ id: rateId, baseMinor: '5000' });
    expect(
      await prisma.auditLog.count({
        where: { requestId: metadata.requestId, action: { startsWith: 'shipping.' } },
      }),
    ).toBe(3);
  });
});
