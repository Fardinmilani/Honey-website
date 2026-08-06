import nodemailer from 'nodemailer';

import type { IdentityEmailMessage, IdentityEmailPort } from '../domain/ports.js';

export type IdentitySmtpConfig = Readonly<{
  host: string;
  port: number;
  secure: boolean;
  from: string;
  connectionTimeoutMs: number;
}>;

export class SmtpIdentityEmailAdapter implements IdentityEmailPort {
  readonly #transport;

  constructor(private readonly config: IdentitySmtpConfig) {
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

  async sendEmailVerification(message: IdentityEmailMessage): Promise<void> {
    await this.#transport.sendMail({
      from: this.config.from,
      to: message.recipient,
      subject: 'Verify your email address',
      text: `Use this one-time verification token before ${message.expiresAt.toISOString()}:\n\n${message.token}`,
    });
  }

  async sendPasswordReset(message: IdentityEmailMessage): Promise<void> {
    await this.#transport.sendMail({
      from: this.config.from,
      to: message.recipient,
      subject: 'Reset your password',
      text: `Use this one-time password reset token before ${message.expiresAt.toISOString()}:\n\n${message.token}`,
    });
  }

  close(): void {
    this.#transport.close();
  }
}
