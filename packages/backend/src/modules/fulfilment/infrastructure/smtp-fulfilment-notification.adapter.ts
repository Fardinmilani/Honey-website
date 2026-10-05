import { randomUUID } from 'node:crypto';

import { createPrismaClient } from '@honey/db';
import nodemailer from 'nodemailer';

import type { FulfilmentNotification, FulfilmentNotificationPort } from '../domain/fulfilment.js';

export type FulfilmentSmtpConfig = Readonly<{
  host: string;
  port: number;
  secure: boolean;
  from: string;
  connectionTimeoutMs: number;
}>;

type NotificationKind = 'SHIPPED' | 'DELIVERED';

function safeTrackingUrl(value: string | null): string | null {
  if (value === null) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.username === '' && url.password === ''
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function messageFor(kind: NotificationKind, notification: FulfilmentNotification) {
  const trackingNumber = notification.trackingNumber;
  const trackingUrl = safeTrackingUrl(notification.trackingUrl);
  if (notification.locale === 'fa') {
    const subject =
      kind === 'SHIPPED'
        ? `سفارش ${notification.orderNumber} ارسال شد`
        : `سفارش ${notification.orderNumber} تحویل داده شد`;
    const lines = [
      kind === 'SHIPPED'
        ? `سفارش ${notification.orderNumber} ارسال شده است.`
        : `سفارش ${notification.orderNumber} تحویل داده شده است.`,
    ];
    if (trackingNumber !== null) lines.push(`شماره رهگیری: ${trackingNumber}`);
    if (trackingUrl !== null) lines.push(`پیوند رهگیری: ${trackingUrl}`);
    return { subject, text: lines.join('\n') };
  }
  const subject =
    kind === 'SHIPPED'
      ? `Your order ${notification.orderNumber} has shipped`
      : `Your order ${notification.orderNumber} was delivered`;
  const lines = [
    kind === 'SHIPPED'
      ? `Your order ${notification.orderNumber} has shipped.`
      : `Your order ${notification.orderNumber} was delivered.`,
  ];
  if (trackingNumber !== null) lines.push(`Tracking number: ${trackingNumber}`);
  if (trackingUrl !== null) lines.push(`Tracking link: ${trackingUrl}`);
  return { subject, text: lines.join('\n') };
}

/**
 * Direct Phase 15 email delivery. A durable (shipment, event) row prevents a
 * successful replay from sending again and allows an unsent transition to be
 * retried through the authorized shipment endpoint. The stock transaction has
 * already committed before this adapter is called.
 */
export class SmtpFulfilmentNotificationAdapter implements FulfilmentNotificationPort {
  readonly #database;
  readonly #transport;

  constructor(
    databaseUrl: string,
    private readonly config: FulfilmentSmtpConfig,
  ) {
    this.#database = createPrismaClient({ databaseUrl });
    this.#transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      connectionTimeout: config.connectionTimeoutMs,
      greetingTimeout: config.connectionTimeoutMs,
      socketTimeout: config.connectionTimeoutMs,
      logger: false,
      debug: false,
    });
  }

  sendShipped(notification: FulfilmentNotification): Promise<void> {
    return this.#send('SHIPPED', notification);
  }

  sendDelivered(notification: FulfilmentNotification): Promise<void> {
    return this.#send('DELIVERED', notification);
  }

  async #send(kind: NotificationKind, notification: FulfilmentNotification): Promise<void> {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(notification.email)) {
      throw new Error('Fulfilment email recipient is invalid.');
    }
    const delivery = await this.#database.fulfilmentEmailDelivery.upsert({
      where: {
        shipmentId_eventType: { shipmentId: notification.shipmentId, eventType: kind },
      },
      create: {
        id: randomUUID(),
        shipmentId: notification.shipmentId,
        eventType: kind,
      },
      update: {},
      select: { id: true, sentAt: true },
    });
    if (delivery.sentAt !== null) return;

    const now = new Date();
    const leaseUntil = new Date(
      now.getTime() + Math.max(this.config.connectionTimeoutMs * 4, 60_000),
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

    const message = messageFor(kind, notification);
    try {
      await this.#transport.sendMail({
        from: this.config.from,
        to: notification.email,
        subject: message.subject,
        text: message.text,
      });
      await this.#database.fulfilmentEmailDelivery.updateMany({
        where: { id: delivery.id, sentAt: null, leaseUntil },
        data: { sentAt: new Date(), leaseUntil: null },
      });
    } catch {
      await this.#database.fulfilmentEmailDelivery.updateMany({
        where: { id: delivery.id, sentAt: null, leaseUntil },
        data: { leaseUntil: null },
      });
      throw new Error('Fulfilment email delivery failed.');
    }
  }

  async close(): Promise<void> {
    this.#transport.close();
    await this.#database.$disconnect();
  }
}
