import nodemailer from 'nodemailer';
import { DependencyUnavailableAppError } from '../../../errors/index.js';
import type { MailSender, Message, SmsSender } from '../domain/notifications.js';
export type NotificationSmtp = Readonly<{
  host: string;
  port: number;
  secure: boolean;
  from: string;
  connectionTimeoutMs: number;
}>;
export class SmtpMailSender implements MailSender {
  readonly transport;
  constructor(private readonly config: NotificationSmtp) {
    this.transport = nodemailer.createTransport({
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
  async send(message: Message) {
    if (
      message.recipient.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(message.recipient) ||
      /[\r\n]/u.test(message.subject)
    )
      throw new DependencyUnavailableAppError({ code: 'NOTIFICATION_DELIVERY_UNAVAILABLE' });
    try {
      await this.transport.sendMail({
        from: this.config.from,
        to: message.recipient,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
    } catch {
      throw new DependencyUnavailableAppError({ code: 'NOTIFICATION_DELIVERY_UNAVAILABLE' });
    }
  }
  async close() {
    this.transport.close();
  }
}
export class DisabledSmsSender implements SmsSender {
  readonly enabled = false;
  async send(): Promise<never> {
    throw new DependencyUnavailableAppError({ code: 'SMS_CAPABILITY_DISABLED' });
  }
}
