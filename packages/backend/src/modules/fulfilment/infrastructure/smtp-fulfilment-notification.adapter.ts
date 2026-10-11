import { randomUUID } from 'node:crypto';
import { createPrismaClient } from '@honey/db';
import { NotificationsModule } from '../../notifications/index.js';
import type { FulfilmentNotification, FulfilmentNotificationPort } from '../domain/fulfilment.js';
export type FulfilmentSmtpConfig = Readonly<{
  host: string;
  port: number;
  secure: boolean;
  from: string;
  connectionTimeoutMs: number;
}>;
class FulfilmentEmailError extends Error {
  constructor(readonly code: 'FULFILMENT_EMAIL_RECIPIENT_INVALID' | 'FULFILMENT_SMTP_UNAVAILABLE') {
    super(code === 'FULFILMENT_SMTP_UNAVAILABLE' ? 'Fulfilment email delivery failed.' : code);
    this.name = 'FulfilmentEmailError';
  }
}
/** Compatibility port for existing callers. Rendering and sending belong to Notifications. */
export class SmtpFulfilmentNotificationAdapter implements FulfilmentNotificationPort {
  readonly #database;
  readonly #notifications;
  constructor(
    databaseUrl: string,
    private readonly config: FulfilmentSmtpConfig,
  ) {
    this.#database = createPrismaClient({ databaseUrl });
    // Shipment messages contain no site action links.
    this.#notifications = NotificationsModule.standalone({
      databaseUrl,
      smtp: config,
      siteOrigin: 'http://localhost:3000',
      enabledLocales: ['fa', 'en'],
    });
  }
  sendShipped(notification: FulfilmentNotification) {
    return this.send('SHIPPED', notification);
  }
  sendDelivered(notification: FulfilmentNotification) {
    return this.send('DELIVERED', notification);
  }
  private async send(kind: 'SHIPPED' | 'DELIVERED', notification: FulfilmentNotification) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(notification.email))
      throw new FulfilmentEmailError('FULFILMENT_EMAIL_RECIPIENT_INVALID');
    await this.#database.fulfilmentEmailDelivery.createMany({
      data: { id: randomUUID(), shipmentId: notification.shipmentId, eventType: kind },
      skipDuplicates: true,
    });
    const delivery = await this.#database.fulfilmentEmailDelivery.findUniqueOrThrow({
      where: { shipmentId_eventType: { shipmentId: notification.shipmentId, eventType: kind } },
      select: { id: true, sentAt: true },
    });
    if (delivery.sentAt !== null) return;
    const now = new Date();
    const leaseUntil = new Date(
      now.getTime() + Math.max(this.config.connectionTimeoutMs * 4, 120000),
    );
    const claim = await this.#database.fulfilmentEmailDelivery.updateMany({
      where: {
        id: delivery.id,
        sentAt: null,
        OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
      },
      data: { leaseUntil, attemptCount: { increment: 1 } },
    });
    if (claim.count !== 1) return;
    try {
      await this.#notifications.service.sendFulfilment(kind, notification);
      await this.#database.fulfilmentEmailDelivery.updateMany({
        where: { id: delivery.id, sentAt: null, leaseUntil },
        data: { sentAt: new Date(), leaseUntil: null },
      });
    } catch {
      await this.#database.fulfilmentEmailDelivery.updateMany({
        where: { id: delivery.id, sentAt: null, leaseUntil },
        data: { leaseUntil: null },
      });
      throw new FulfilmentEmailError('FULFILMENT_SMTP_UNAVAILABLE');
    }
  }
  async close() {
    await Promise.allSettled([this.#notifications.close(), this.#database.$disconnect()]);
  }
}
