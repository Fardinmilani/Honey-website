import { createHash, randomUUID } from 'node:crypto';
import { createPrismaClient, type PrismaClient } from '@honey/db';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import {
  createAdminTestDatabase,
  dropAdminTestDatabase,
  type AdminTestDatabase,
} from './helpers/admin-test-database.js';
import { ContentService } from '../src/modules/content/application/content.service.js';
import { PrismaContentRepository } from '../src/modules/content/infrastructure/prisma-content.repository.js';
import { ReviewsService } from '../src/modules/reviews/application/reviews.service.js';
import { PrismaReviewsRepository } from '../src/modules/reviews/infrastructure/prisma-reviews.repository.js';
import { ReviewPurchaseService } from '../src/modules/orders/application/review-purchase.service.js';
import { PrismaReviewPurchaseRepository } from '../src/modules/orders/infrastructure/prisma-review-purchase.repository.js';
import { PrismaOrdersRepository } from '../src/modules/orders/infrastructure/prisma-orders.repository.js';
import { OrdersService } from '../src/modules/orders/application/orders.service.js';
import { InventoryService } from '../src/modules/inventory/application/inventory.service.js';
import { PrismaInventoryRepository } from '../src/modules/inventory/infrastructure/prisma-inventory.repository.js';
import { FulfilmentService } from '../src/modules/fulfilment/application/fulfilment.service.js';
import { PrismaFulfilmentRepository } from '../src/modules/fulfilment/infrastructure/prisma-fulfilment.repository.js';
import { ManualFlatShippingProvider } from '../src/modules/shipping/infrastructure/manual-flat-shipping.provider.js';
import { CatalogService } from '../src/modules/catalog/application/catalog.service.js';
import { PrismaCatalogRepository } from '../src/modules/catalog/infrastructure/prisma-catalog.repository.js';
import { InMemoryCatalogCache } from '../src/modules/catalog/infrastructure/in-memory-catalog-cache.adapter.js';
import { PrismaPlatformAdapter } from '../src/platform/infrastructure/prisma-platform.adapter.js';
import { NotificationsService } from '../src/modules/notifications/application/notifications.service.js';
import { PrismaNotificationsRepository } from '../src/modules/notifications/infrastructure/prisma-notifications.repository.js';
import type { MailSender } from '../src/modules/notifications/domain/notifications.js';
import type { AuthenticatedPrincipal } from '../src/modules/identity/domain/identity.js';
import { RedisContentCache } from '../src/modules/content/infrastructure/redis-content-cache.js';
const hash = (v: string) => createHash('sha256').update(v).digest('hex');
const meta = { requestId: 'phase18-test' };
class Mail implements MailSender {
  messages: Parameters<MailSender['send']>[0][] = [];
  async send(message: Parameters<MailSender['send']>[0]) {
    this.messages.push(message);
  }
  async close() {}
}
describe('Phase 18 real PostgreSQL state and concurrency', () => {
  let db: AdminTestDatabase,
    prisma: PrismaClient,
    contentRepo: PrismaContentRepository,
    reviewsRepo: PrismaReviewsRepository,
    purchasesRepo: PrismaReviewPurchaseRepository,
    ordersRepo: PrismaOrdersRepository,
    inventoryRepo: PrismaInventoryRepository,
    fulfilmentRepo: PrismaFulfilmentRepository,
    catalogRepo: PrismaCatalogRepository,
    platform: PrismaPlatformAdapter,
    notificationsRepo: PrismaNotificationsRepository;
  let content: ContentService,
    reviews: ReviewsService,
    fulfilment: FulfilmentService,
    notifications: NotificationsService,
    staff: AuthenticatedPrincipal;
  const mail = new Mail();
  const customers: AuthenticatedPrincipal[] = [];
  const productId = randomUUID();
  const cache = new RedisContentCache(
    process.env['REDIS_URL'] ?? 'redis://127.0.0.1:6379',
    'honey:phase18:' + randomUUID(),
  );
  beforeAll(async () => {
    db = await createAdminTestDatabase();
    prisma = createPrismaClient({ databaseUrl: db.databaseUrl });
    contentRepo = new PrismaContentRepository(db.databaseUrl);
    reviewsRepo = new PrismaReviewsRepository(db.databaseUrl);
    purchasesRepo = new PrismaReviewPurchaseRepository(db.databaseUrl);
    ordersRepo = new PrismaOrdersRepository(db.databaseUrl);
    inventoryRepo = new PrismaInventoryRepository(db.databaseUrl);
    fulfilmentRepo = new PrismaFulfilmentRepository(db.databaseUrl);
    catalogRepo = new PrismaCatalogRepository(db.databaseUrl);
    platform = new PrismaPlatformAdapter(db.databaseUrl);
    notificationsRepo = new PrismaNotificationsRepository(db.databaseUrl);
    const actor = await prisma.user.create({
      data: { id: randomUUID(), email: 'phase18-staff@example.invalid', isStaff: true },
    });
    staff = {
      userId: actor.id,
      sessionId: randomUUID(),
      kind: 'STAFF',
      permissions: ['content:read', 'content:write', 'content:publish', 'review:moderate'],
    };
    for (let i = 0; i < 7; i++) {
      const u = await prisma.user.create({
        data: { id: randomUUID(), email: `phase18-customer-${i}@example.invalid` },
      });
      customers.push({
        userId: u.id,
        sessionId: randomUUID(),
        kind: 'CUSTOMER',
        permissions: ['review:submit'],
      });
    }
    await prisma.product.create({
      data: {
        id: productId,
        sourcingType: 'OWN_PRODUCTION',
        status: 'PUBLISHED',
        translations: {
          create: [
            { id: randomUUID(), locale: 'fa', name: 'عسل کوهستان', slug: 'mountain-fa' },
            { id: randomUUID(), locale: 'en', name: 'Mountain honey', slug: 'mountain-en' },
          ],
        },
      },
    });
    const orders = new OrdersService(ordersRepo);
    fulfilment = new FulfilmentService(
      fulfilmentRepo,
      orders,
      new InventoryService(inventoryRepo),
      platform,
      new ManualFlatShippingProvider(),
      { sendShipped: async () => undefined, sendDelivered: async () => undefined },
    );
    const catalog = new CatalogService(
      {
        enabledLocales: ['fa', 'en'],
        defaultLocale: 'fa',
        cacheTtlSeconds: 60,
        cacheNamespace: 'phase18-test',
        searchQueryMaxLength: 120,
        maximumCategoryDepth: 5,
      },
      catalogRepo,
      new InMemoryCatalogCache(),
      { resolvePublicAssets: async () => [] },
    );
    content = new ContentService(
      contentRepo,
      { resolvePublicCatalogAssets: async () => [] },
      ['fa', 'en'],
      cache,
    );
    reviews = new ReviewsService(
      reviewsRepo,
      new ReviewPurchaseService(purchasesRepo),
      fulfilment,
      catalog,
      platform,
      ['fa', 'en'],
    );
    notifications = new NotificationsService(notificationsRepo, mail, 'https://example.invalid', [
      'fa',
      'en',
    ]);
  }, 120000);
  afterAll(async () => {
    await Promise.allSettled([
      contentRepo?.close(),
      reviewsRepo?.close(),
      purchasesRepo?.close(),
      ordersRepo?.close(),
      inventoryRepo?.close(),
      fulfilmentRepo?.close(),
      catalogRepo?.close(),
      platform?.close(),
      notificationsRepo?.close(),
      prisma?.$disconnect(),
      cache.close(),
    ]);
    if (db !== undefined) await dropAdminTestDatabase(db);
  });
  function customer(i: number) {
    const c = customers[i];
    if (c === undefined) throw new Error('FIXTURE_MISSING');
    return c;
  }
  async function purchase(i: number, delivered = true, guest = false) {
    const id = randomUUID(),
      lineId = randomUUID();
    await prisma.order.create({
      data: {
        id,
        userId: guest ? null : customer(i).userId,
        number: 'HNY-TEST-' + id,
        email: 'phase18-order@example.invalid',
        localeAtPurchase: i % 2 ? 'fa' : 'en',
        currency: 'IRR',
        status: 'FULFILLED',
        paymentStatus: 'PAID',
        fulfilmentStatus: 'FULFILLED',
        subtotalMinor: 1000n,
        grandTotalMinor: 1000n,
        shippingMethodSnapshot: { code: 'manual-flat' },
        shippingAddressSnapshot: {},
        billingAddressSnapshot: {},
        lines: {
          create: {
            id: lineId,
            productId,
            skuSnapshot: 'TEST',
            productNameSnapshot: { en: 'Frozen name', fa: 'نام ثبت‌شده' },
            variantNameSnapshot: {},
            attributesSnapshot: {},
            quantity: 1,
            unitPriceMinor: 1000n,
            taxRateBps: 0,
            taxAmountMinor: 0n,
            lineTotalMinor: 1000n,
          },
        },
      },
    });
    const shipmentId = randomUUID();
    await prisma.shipment.create({
      data: {
        id: shipmentId,
        orderId: id,
        provider: 'manual-flat',
        status: delivered ? 'DELIVERED' : 'IN_TRANSIT',
        ...(delivered ? { deliveredAt: new Date() } : {}),
        lines: { create: { id: randomUUID(), orderLineId: lineId, quantity: 1 } },
      },
    });
    return { id, shipmentId };
  }
  const t = (locale: string, slug: string) => ({
    locale,
    title: locale === 'fa' ? 'خاستگاه' : 'Origin',
    slug,
    blocks: [{ type: 'paragraph' as const, text: locale === 'fa' ? 'عطر گل' : 'Floral aroma' }],
    metaTitle: null,
    metaDescription: null,
  });
  it('publishes Page/Article/FAQ only after both locales, preserves safe public DTOs and atomic events', async () => {
    for (const kind of ['page', 'article', 'faq'] as const) {
      const row = await content.create(staff, kind, 'test-' + kind, meta);
      await content.save(staff, kind, row.id, t('en', kind + '-en'), meta);
      await expect(content.transition(staff, kind, row.id, 'PUBLISHED', meta)).rejects.toThrow();
      expect((await content.listPublic(kind, 'en')).items).toHaveLength(0);
      await content.save(staff, kind, row.id, t('fa', kind + '-fa'), meta);
      await content.transition(staff, kind, row.id, 'PUBLISHED', meta);
      const page = await content.listPublic(kind, 'fa');
      expect(page.items).toHaveLength(1);
      expect(page.items[0]?.title).toBe('خاستگاه');
      expect(JSON.stringify(page)).not.toMatch(/createdBy|storageKey|actorUserId/);
      if (kind !== 'faq') {
        expect((await content.publicDetail(kind, 'en', kind + '-en')).id).toBe(row.id);
        expect(await cache.get(`${kind}:en:${kind}-en`)).toBe(row.id);
      }
      await content.transition(staff, kind, row.id, 'ARCHIVED', meta);
      expect((await content.listPublic(kind, 'en')).items).toHaveLength(0);
      expect(
        await prisma.outboxEvent.count({
          where: { aggregateId: row.id, eventType: 'content.published' },
        }),
      ).toBe(1);
      expect(await prisma.auditLog.count({ where: { subjectId: row.id } })).toBe(5);
    }
  });
  it('rejects private/unknown media, locale fallback and unauthorized publication', async () => {
    const row = await content.create(staff, 'page', 'private-image', meta);
    await expect(
      content.save(
        staff,
        'page',
        row.id,
        {
          ...t('en', 'image'),
          blocks: [{ type: 'image', mediaAssetId: randomUUID(), alt: 'Jar' }],
        },
        meta,
      ),
    ).rejects.toThrow();
    await expect(
      content.transition(
        { ...staff, permissions: ['content:read'] },
        'page',
        row.id,
        'PUBLISHED',
        meta,
      ),
    ).rejects.toThrow();
    await expect(content.publicDetail('page', 'fa', 'image')).rejects.toThrow();
  });
  it('enforces slug uniqueness under competing writes', async () => {
    const a = await content.create(staff, 'article', 'first', meta),
      b = await content.create(staff, 'article', 'second', meta);
    const settled = await Promise.allSettled([
      content.save(staff, 'article', a.id, t('en', 'same-slug'), meta),
      content.save(staff, 'article', b.id, t('en', 'same-slug'), meta),
    ]);
    expect(settled.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(settled.filter((r) => r.status === 'rejected')).toHaveLength(1);
  });
  it('gates by ownership, full delivery, guest and refund state, and rating bounds', async () => {
    const p = await purchase(0, false);
    expect((await reviews.eligibility(customer(0), productId)).eligible).toBe(false);
    await prisma.shipment.update({
      where: { id: p.shipmentId },
      data: { status: 'DELIVERED', deliveredAt: new Date() },
    });
    expect((await reviews.eligibility(customer(0), productId)).eligible).toBe(true);
    await expect(
      reviews.submit(customer(1), {
        productId,
        orderId: p.id,
        rating: 5,
        title: 'Taste',
        body: 'Floral',
        locale: 'en',
      }),
    ).rejects.toThrow();
    await expect(
      reviews.submit(customer(0), {
        productId,
        rating: 6,
        title: 'Taste',
        body: 'Floral',
        locale: 'en',
      }),
    ).rejects.toThrow();
    await prisma.order.update({
      where: { id: p.id },
      data: { refundedTotalMinor: 1000n, paymentStatus: 'REFUNDED', status: 'REFUNDED' },
    });
    expect((await reviews.eligibility(customer(0), productId)).eligible).toBe(false);
    await purchase(6, true, true);
    expect((await reviews.eligibility(customer(6), productId)).eligible).toBe(false);
  });
  it('one pending immutable review survives concurrency and never appears publicly', async () => {
    await purchase(1);
    const input = { productId, rating: 5, title: 'Taste', body: 'Floral aroma', locale: 'fa' };
    const settled = await Promise.allSettled([
      reviews.submit(customer(1), input),
      reviews.submit(customer(1), input),
    ]);
    expect(settled.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await reviews.publicPage(productId, {})).aggregate).toBeNull();
    const row = await prisma.productReview.findUniqueOrThrow({
      where: { userId_productId: { userId: customer(1).userId, productId } },
    });
    await expect(
      prisma.productReview.update({ where: { id: row.id }, data: { body: 'Rewrite' } }),
    ).rejects.toThrow();
  });
  it('rejects prohibited approval, then approves only safe text and calculates approved-only aggregate', async () => {
    await purchase(2);
    const bad = await reviews.submit(customer(2), {
      productId,
      rating: 1,
      title: 'Claim',
      body: 'This cures illness',
      locale: 'en',
    });
    await expect(reviews.moderate(staff, bad.id, 'APPROVED', meta)).rejects.toThrow();
    await reviews.moderate(staff, bad.id, 'REJECTED', meta);
    const safe = await prisma.productReview.findUniqueOrThrow({
      where: { userId_productId: { userId: customer(1).userId, productId } },
    });
    const outcomes = await Promise.allSettled([
      reviews.moderate(staff, safe.id, 'APPROVED', meta),
      reviews.moderate(staff, safe.id, 'REJECTED', meta),
    ]);
    expect(outcomes.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const publicRows = await reviews.publicPage(productId, {});
    const state = await prisma.productReview.findUniqueOrThrow({ where: { id: safe.id } });
    expect(publicRows.aggregate).toEqual(
      state.status === 'APPROVED' ? { count: 1, average: 5 } : null,
    );
    expect(JSON.stringify(publicRows)).not.toMatch(/userId|orderId|moderatedBy|email/);
    expect(await prisma.auditLog.count({ where: { subjectId: safe.id } })).toBe(1);
  });
  it('keeps an approved review after a later refund and escapes XSS-shaped original text', async () => {
    const p = await purchase(3);
    const row = await reviews.submit(customer(3), {
      productId,
      rating: 4,
      title: 'Texture',
      body: '<script>window.injected=true</script> Smooth texture',
      locale: 'en',
    });
    await reviews.moderate(staff, row.id, 'APPROVED', meta);
    await prisma.order.update({
      where: { id: p.id },
      data: { refundedTotalMinor: 1000n, paymentStatus: 'REFUNDED', status: 'REFUNDED' },
    });
    const page = await reviews.publicPage(productId, {});
    expect(page.items.some((r) => r.id === row.id)).toBe(true);
    expect(page.items.find((r) => r.id === row.id)?.body).toContain('<script>');
  });
  it('derives order message locale from frozen purchase rather than staff or preferred locale and fences replay', async () => {
    const p = await purchase(4);
    await prisma.user.update({
      where: { id: customer(4).userId },
      data: { preferredLocale: 'fa' },
    });
    const context = {
      kind: 'SYSTEM' as const,
      source: 'WORKER' as const,
      correlationId: 'phase18-mail',
    };
    await Promise.all([
      notifications.sendShipmentForSystem(
        context,
        { shipmentId: p.shipmentId, kind: 'DELIVERED' },
        fulfilment,
      ),
      notifications.sendShipmentForSystem(
        context,
        { shipmentId: p.shipmentId, kind: 'DELIVERED' },
        fulfilment,
      ),
    ]);
    expect(mail.messages.filter((m) => m.subject.includes('HNY-TEST-' + p.id))).toHaveLength(1);
    expect(mail.messages.at(-1)?.html).toContain('lang="en" dir="ltr"');
    expect(
      await prisma.notificationDelivery.count({
        where: { dedupeKey: `fulfilment:${p.shipmentId}:DELIVERED`, status: 'SENT' },
      }),
    ).toBe(1);
  });
  it('newsletter consent, citext dedupe, hashed token, concurrent single use and unsubscribe are real', async () => {
    await expect(
      notifications.subscribe({ email: 'reader@example.invalid', locale: 'fa', consent: false }),
    ).rejects.toThrow();
    await Promise.all([
      notifications.subscribe({ email: 'Reader@example.invalid', locale: 'fa', consent: true }),
      notifications.subscribe({ email: 'reader@example.invalid', locale: 'fa', consent: true }),
    ]);
    let sub = await prisma.newsletterSubscription.findUniqueOrThrow({
      where: { email: 'reader@example.invalid' },
    });
    expect(sub.status).toBe('PENDING');
    expect(
      await prisma.newsletterSubscription.count({ where: { email: 'reader@example.invalid' } }),
    ).toBe(1);
    const delivery = await prisma.notificationDelivery.findFirstOrThrow({
      where: { subscriptionId: sub.id },
    });
    expect(
      JSON.stringify(await prisma.outboxEvent.findMany({ where: { aggregateId: delivery.id } })),
    ).not.toContain('reader@example.invalid');
    await notifications.sendNewsletterForSystem(
      { kind: 'SYSTEM', source: 'WORKER', correlationId: 'newsletter-test' },
      delivery.id,
    );
    const message = mail.messages.at(-1);
    if (message === undefined) throw new Error('MAIL_MISSING');
    const link = message.text.match(/https:\/\/[^\s]+/u)?.[0];
    if (link === undefined) throw new Error('LINK_MISSING');
    const token = new URL(link).searchParams.get('token');
    if (token === null) throw new Error('TOKEN_MISSING');
    sub = await prisma.newsletterSubscription.findUniqueOrThrow({ where: { id: sub.id } });
    expect(sub.confirmationHash).toBe(hash(token));
    expect(JSON.stringify(sub).includes(token)).toBe(false);
    expect(message.html).toContain('lang="fa" dir="rtl"');
    await Promise.all([notifications.confirm(token), notifications.confirm(token)]);
    expect(
      (await prisma.newsletterSubscription.findUniqueOrThrow({ where: { id: sub.id } })).status,
    ).toBe('CONFIRMED');
    expect(
      await prisma.notificationDelivery.count({
        where: { subscriptionId: sub.id, templateCode: 'newsletter-welcome' },
      }),
    ).toBe(1);
    const welcome = await prisma.notificationDelivery.findFirstOrThrow({
      where: { subscriptionId: sub.id, templateCode: 'newsletter-welcome' },
    });
    await notifications.sendNewsletterForSystem(
      { kind: 'SYSTEM', source: 'WORKER', correlationId: 'welcome-test' },
      welcome.id,
    );
    const unsubscribe = mail.messages.at(-1)?.text.match(/https:\/\/[^\s]+/u)?.[0];
    if (unsubscribe === undefined) throw new Error('LINK_MISSING');
    const ut = new URL(unsubscribe).searchParams.get('token');
    if (ut === null) throw new Error('TOKEN_MISSING');
    await Promise.all([notifications.unsubscribe(ut), notifications.unsubscribe(ut)]);
    expect(
      (await prisma.newsletterSubscription.findUniqueOrThrow({ where: { id: sub.id } })).status,
    ).toBe('UNSUBSCRIBED');
    expect(
      await prisma.outboxEvent.count({
        where: { aggregateId: sub.id, eventType: 'newsletter.unsubscribed' },
      }),
    ).toBe(1);
    const before = mail.messages.length;
    await notifications.sendNewsletterForSystem(
      { kind: 'SYSTEM', source: 'WORKER', correlationId: 'replay' },
      welcome.id,
    );
    expect(mail.messages).toHaveLength(before);
  });
  it('resubscription requires fresh consent and confirmation, invalidates every previous link and stays pending', async () => {
    const email = 'renew@example.invalid';
    const system = { kind: 'SYSTEM' as const, source: 'WORKER' as const, correlationId: 'renew' };
    const tokenFromLastMail = () => {
      const link = mail.messages.at(-1)?.text.match(/https:\/\/[^\s]+/u)?.[0];
      if (link === undefined) throw new Error('LINK_MISSING');
      const token = new URL(link).searchParams.get('token');
      if (token === null) throw new Error('TOKEN_MISSING');
      return token;
    };
    await notifications.subscribe({ email, locale: 'en', consent: true });
    const sub = await prisma.newsletterSubscription.findUniqueOrThrow({ where: { email } });
    const first = await prisma.notificationDelivery.findFirstOrThrow({
      where: { subscriptionId: sub.id, templateCode: 'newsletter-confirm' },
    });
    await notifications.sendNewsletterForSystem(system, first.id);
    const oldConfirm = tokenFromLastMail();
    await notifications.confirm(oldConfirm);
    const welcome = await prisma.notificationDelivery.findFirstOrThrow({
      where: { subscriptionId: sub.id, templateCode: 'newsletter-welcome' },
    });
    await notifications.sendNewsletterForSystem(system, welcome.id);
    const oldUnsubscribe = tokenFromLastMail();
    await notifications.unsubscribe(oldUnsubscribe);
    await expect(
      notifications.subscribe({ email, locale: 'fa', consent: false }),
    ).rejects.toThrow();
    expect(
      (await prisma.newsletterSubscription.findUniqueOrThrow({ where: { id: sub.id } })).status,
    ).toBe('UNSUBSCRIBED');
    await notifications.subscribe({ email, locale: 'fa', consent: true });
    const renewed = await prisma.newsletterSubscription.findUniqueOrThrow({
      where: { id: sub.id },
    });
    expect(renewed.status).toBe('PENDING');
    expect(renewed.confirmationHash).toBeNull();
    expect(renewed.unsubscribeHash).toBeNull();
    expect(renewed.locale).toBe('fa');
    expect(renewed.requestId).not.toBe(sub.requestId);
    await notifications.confirm(oldConfirm);
    await notifications.unsubscribe(oldUnsubscribe);
    expect(
      (await prisma.newsletterSubscription.findUniqueOrThrow({ where: { id: sub.id } })).status,
    ).toBe('PENDING');
    const count = mail.messages.length;
    await notifications.sendNewsletterForSystem(system, welcome.id);
    expect(mail.messages).toHaveLength(count);
    const next = await prisma.notificationDelivery.findFirstOrThrow({
      where: { subscriptionId: sub.id, templateCode: 'newsletter-confirm', id: { not: first.id } },
    });
    await notifications.sendNewsletterForSystem(system, next.id);
    const fresh = tokenFromLastMail();
    expect(fresh).not.toBe(oldConfirm);
    await notifications.confirm(fresh);
    expect(
      (await prisma.newsletterSubscription.findUniqueOrThrow({ where: { id: sub.id } })).status,
    ).toBe('CONFIRMED');
    await notifications.unsubscribe(oldUnsubscribe);
    expect(
      (await prisma.newsletterSubscription.findUniqueOrThrow({ where: { id: sub.id } })).status,
    ).toBe('CONFIRMED');
  });
  it('does not confirm an expired token or silently fall back to another template locale', async () => {
    await notifications.subscribe({ email: 'expiry@example.invalid', locale: 'en', consent: true });
    const sub = await prisma.newsletterSubscription.findUniqueOrThrow({
      where: { email: 'expiry@example.invalid' },
    });
    const token = 'x'.repeat(43);
    await prisma.newsletterSubscription.update({
      where: { id: sub.id },
      data: { confirmationHash: hash(token), confirmationExpiresAt: new Date(Date.now() - 1000) },
    });
    await notifications.confirm(token);
    expect(
      (await prisma.newsletterSubscription.findUniqueOrThrow({ where: { id: sub.id } })).status,
    ).toBe('PENDING');
    await prisma.notificationTemplate.deleteMany({
      where: { code: 'shipment-delivered', locale: 'fa', channel: 'EMAIL' },
    });
    const p = await purchase(5);
    await expect(
      notifications.sendShipmentForSystem(
        { kind: 'SYSTEM', source: 'WORKER', correlationId: 'missing-locale' },
        { shipmentId: p.shipmentId, kind: 'DELIVERED' },
        fulfilment,
      ),
    ).rejects.toThrow();
  });
});
