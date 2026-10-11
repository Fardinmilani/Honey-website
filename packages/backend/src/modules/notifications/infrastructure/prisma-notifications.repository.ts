import { createHash, randomUUID } from 'node:crypto';
import { createPrismaClient, type TransactionClient } from '@honey/db';
import {
  adminPage,
  adminPageInput,
  type AdminPageInput,
} from '../../../platform/domain/admin-page.js';
import { templateCode, type Template } from '../domain/templates.js';
import type {
  DeliveryClaim,
  DeliveryInput,
  NotificationActor,
  NotificationsRepository,
} from '../domain/notifications.js';
function recipientHash(email: string) {
  return createHash('sha256').update(email.toLowerCase()).digest('hex');
}
function newsletterEvent(id: string, type: string) {
  return {
    id: randomUUID(),
    aggregateType: 'newsletter',
    aggregateId: id,
    eventType: type,
    payload: { aggregateId: id, version: 1 },
  };
}
export class PrismaNotificationsRepository implements NotificationsRepository {
  readonly client;
  constructor(
    databaseUrl: string,
    private readonly leaseDurationMs = 120000,
  ) {
    this.client = createPrismaClient({ databaseUrl });
  }
  async listTemplates(input: AdminPageInput) {
    const page = adminPageInput(input);
    const rows = await this.client.notificationTemplate.findMany({
      where: page.cursor === undefined ? {} : { id: { lt: page.cursor } },
      orderBy: { id: 'desc' },
      take: page.limit + 1,
    });
    return adminPage(
      rows.map((t) => ({
        id: t.id,
        code: templateCode(t.code),
        locale: t.locale,
        channel: t.channel,
        subject: t.subject,
        body: t.body,
        updatedAt: t.updatedAt.toISOString(),
      })),
      page.limit,
    );
  }
  async template(code: Template['code'], locale: string, channel: Template['channel']) {
    const row = await this.client.notificationTemplate.findUnique({
      where: { code_locale_channel: { code, locale, channel } },
    });
    return row === null
      ? null
      : {
          code: templateCode(row.code),
          locale: row.locale,
          channel: row.channel,
          subject: row.subject,
          body: row.body,
        };
  }
  async saveTemplate(template: Template, actor: NotificationActor) {
    return this.client.$transaction(async (tx) => {
      const row = await tx.notificationTemplate.upsert({
        where: {
          code_locale_channel: {
            code: template.code,
            locale: template.locale,
            channel: template.channel,
          },
        },
        create: {
          id: randomUUID(),
          ...template,
          createdBy: actor.principal.userId,
          updatedBy: actor.principal.userId,
        },
        update: {
          subject: template.subject,
          body: template.body,
          updatedBy: actor.principal.userId,
        },
      });
      await tx.auditLog.create({
        data: {
          id: randomUUID(),
          actorUserId: actor.principal.userId,
          action: 'notification.template_updated',
          subjectType: 'notification_template',
          subjectId: row.id,
          requestId: actor.metadata.requestId,
          ip: actor.metadata.clientIp ?? null,
          beforeJson: { changed: true },
          afterJson: { code: template.code, locale: template.locale, channel: template.channel },
        },
      });
      return {
        id: row.id,
        code: template.code,
        locale: row.locale,
        channel: row.channel,
        subject: row.subject,
        body: row.body,
        updatedAt: row.updatedAt.toISOString(),
      };
    });
  }
  async claimDelivery(input: DeliveryInput): Promise<DeliveryClaim | null> {
    await this.client.notificationDelivery.createMany({
      data: {
        id: randomUUID(),
        dedupeKey: input.dedupeKey,
        templateCode: input.templateCode,
        channel: 'EMAIL',
        recipientHash: recipientHash(input.recipient),
        locale: input.locale,
        ...(input.subscriptionId === undefined ? {} : { subscriptionId: input.subscriptionId }),
      },
      skipDuplicates: true,
    });
    return this.client.$transaction(async (tx) => {
      const row = await tx.notificationDelivery.findUniqueOrThrow({
        where: { dedupeKey: input.dedupeKey },
      });
      return this.claim(tx, row.id);
    });
  }
  private async claim(tx: TransactionClient, id: string): Promise<DeliveryClaim | null> {
    const leaseToken = randomUUID();
    const now = new Date();
    const result = await tx.notificationDelivery.updateMany({
      where: {
        id,
        status: { in: ['QUEUED', 'FAILED'] },
        OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
      },
      data: {
        status: 'QUEUED',
        leaseToken,
        leaseUntil: new Date(now.getTime() + this.leaseDurationMs),
        attemptCount: { increment: 1 },
      },
    });
    return result.count === 1 ? { id, leaseToken } : null;
  }
  async finishDelivery(claim: DeliveryClaim, sent: boolean) {
    await this.client.notificationDelivery.updateMany({
      where: { id: claim.id, leaseToken: claim.leaseToken, status: 'QUEUED' },
      data: {
        status: sent ? 'SENT' : 'FAILED',
        sentAt: sent ? new Date() : null,
        leaseToken: null,
        leaseUntil: null,
      },
    });
  }
  async requestSubscription(email: string, locale: string) {
    await this.client.$transaction(async (tx) => {
      const now = new Date();
      const requestId = randomUUID();
      await tx.newsletterSubscription.createMany({
        data: { id: randomUUID(), email, locale, requestId },
        skipDuplicates: true,
      });
      const initial = await tx.newsletterSubscription.findUniqueOrThrow({
        where: { email },
        select: { id: true },
      });
      await tx.$queryRaw`SELECT id FROM newsletter_subscription WHERE id = ${initial.id}::uuid FOR UPDATE`;
      const row = await tx.newsletterSubscription.findUniqueOrThrow({ where: { id: initial.id } });
      // Human-approved resubscribe: fresh consent + fresh confirmation, with
      // every previous confirmation/unsubscribe link invalidated atomically.
      if (row.status === 'CONFIRMED') return;
      // Bound confirmation mail retries, without revealing subscription state.
      const existing = await tx.notificationDelivery.findFirst({
        where: {
          subscriptionId: row.id,
          templateCode: 'newsletter-confirm',
          createdAt: { gt: new Date(now.getTime() - 60000) },
        },
      });
      if (existing !== null && row.status === 'PENDING') return;
      await tx.newsletterSubscription.update({
        where: { id: row.id },
        data: {
          status: 'PENDING',
          confirmedAt: null,
          unsubscribedAt: null,
          locale,
          requestId,
          confirmationHash: null,
          confirmationExpiresAt: null,
          confirmationConsumedAt: null,
          unsubscribeHash: null,
          unsubscribeExpiresAt: null,
        },
      });
      await this.enqueueNewsletter(tx, row.id, email, locale, 'newsletter-confirm', requestId);
    });
  }
  private async enqueueNewsletter(
    tx: TransactionClient,
    subscriptionId: string,
    email: string,
    locale: string,
    code: 'newsletter-confirm' | 'newsletter-welcome',
    requestId: string,
  ) {
    const deliveryId = randomUUID();
    await tx.notificationDelivery.create({
      data: {
        id: deliveryId,
        dedupeKey: `${code}:${subscriptionId}:${requestId}`,
        templateCode: code,
        channel: 'EMAIL',
        recipientHash: recipientHash(email),
        locale,
        subscriptionId,
      },
    });
    await tx.outboxEvent.create({
      data: newsletterEvent(deliveryId, 'notification.newsletter_queued'),
    });
  }
  async prepareNewsletter(deliveryId: string, tokenHash: string) {
    return this.client.$transaction(async (tx) => {
      const initial = await tx.notificationDelivery.findUnique({
        where: { id: deliveryId },
        select: { subscriptionId: true },
      });
      if (initial?.subscriptionId === null || initial?.subscriptionId === undefined) return null;
      await tx.$queryRaw`SELECT id FROM newsletter_subscription WHERE id = ${initial.subscriptionId}::uuid FOR UPDATE`;
      const row = await tx.notificationDelivery.findUniqueOrThrow({
        where: { id: deliveryId },
        include: { subscription: true },
      });
      const sub = row.subscription;
      if (
        sub === null ||
        row.status === 'SENT' ||
        row.dedupeKey !== `${row.templateCode}:${sub.id}:${sub.requestId}` ||
        (row.templateCode === 'newsletter-confirm'
          ? sub.status !== 'PENDING'
          : row.templateCode !== 'newsletter-welcome' || sub.status !== 'CONFIRMED')
      )
        return null;
      const claim = await this.claim(tx, row.id);
      if (claim === null) return null;
      const code: 'newsletter-confirm' | 'newsletter-welcome' =
        row.templateCode === 'newsletter-confirm' ? 'newsletter-confirm' : 'newsletter-welcome';
      await tx.newsletterSubscription.update({
        where: { id: sub.id },
        data:
          code === 'newsletter-confirm'
            ? {
                confirmationHash: tokenHash,
                confirmationExpiresAt: new Date(Date.now() + 86400000),
                confirmationConsumedAt: null,
              }
            : {
                unsubscribeHash: tokenHash,
                unsubscribeExpiresAt: new Date(Date.now() + 31536000000),
              },
      });
      return { recipient: sub.email, locale: sub.locale, code, claim };
    });
  }
  async confirm(hash: string) {
    await this.client.$transaction(async (tx) => {
      const row = await tx.newsletterSubscription.findUnique({ where: { confirmationHash: hash } });
      if (row === null) return;
      const now = new Date();
      const result = await tx.newsletterSubscription.updateMany({
        where: {
          id: row.id,
          status: 'PENDING',
          confirmationHash: hash,
          confirmationConsumedAt: null,
          confirmationExpiresAt: { gt: now },
        },
        data: { status: 'CONFIRMED', confirmedAt: now, confirmationConsumedAt: now },
      });
      if (result.count !== 1) return;
      await tx.outboxEvent.create({ data: newsletterEvent(row.id, 'newsletter.confirmed') });
      await this.enqueueNewsletter(
        tx,
        row.id,
        row.email,
        row.locale,
        'newsletter-welcome',
        row.requestId,
      );
    });
  }
  async unsubscribe(hash: string) {
    await this.client.$transaction(async (tx) => {
      const row = await tx.newsletterSubscription.findUnique({ where: { unsubscribeHash: hash } });
      if (row === null) return;
      const result = await tx.newsletterSubscription.updateMany({
        where: {
          id: row.id,
          status: 'CONFIRMED',
          unsubscribeHash: hash,
          unsubscribeExpiresAt: { gt: new Date() },
        },
        data: { status: 'UNSUBSCRIBED', unsubscribedAt: new Date() },
      });
      if (result.count === 1)
        await tx.outboxEvent.create({ data: newsletterEvent(row.id, 'newsletter.unsubscribed') });
    });
  }
  close() {
    return this.client.$disconnect();
  }
}
