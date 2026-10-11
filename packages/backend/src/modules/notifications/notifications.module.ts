import { Module, type DynamicModule, type OnApplicationShutdown } from '@nestjs/common';
import { NotificationsService } from './application/notifications.service.js';
import { PrismaNotificationsRepository } from './infrastructure/prisma-notifications.repository.js';
import {
  SmtpMailSender,
  DisabledSmsSender,
  type NotificationSmtp,
} from './infrastructure/smtp-mail-sender.js';
class Shutdown implements OnApplicationShutdown {
  constructor(
    private readonly repository: PrismaNotificationsRepository,
    private readonly sender: SmtpMailSender,
  ) {}
  async onApplicationShutdown() {
    await Promise.allSettled([this.repository.close(), this.sender.close()]);
  }
}
@Module({})
export class NotificationsModule {
  static standalone(
    options: Readonly<{
      databaseUrl: string;
      smtp: NotificationSmtp;
      siteOrigin: string;
      enabledLocales: readonly string[];
    }>,
  ) {
    const origin = new URL(options.siteOrigin);
    if (
      origin.origin !== options.siteOrigin ||
      !['http:', 'https:'].includes(origin.protocol) ||
      origin.username !== '' ||
      origin.password !== ''
    )
      throw new Error('NOTIFICATION_ORIGIN_INVALID');
    const repository = new PrismaNotificationsRepository(
      options.databaseUrl,
      Math.max(options.smtp.connectionTimeoutMs * 4, 120000),
    );
    const sender = new SmtpMailSender(options.smtp);
    return {
      service: new NotificationsService(
        repository,
        sender,
        options.siteOrigin,
        options.enabledLocales,
      ),
      close: async () => {
        await Promise.allSettled([repository.close(), sender.close()]);
      },
    };
  }
  static register(
    options: Readonly<{
      databaseUrl: string;
      smtp: NotificationSmtp;
      siteOrigin: string;
      enabledLocales: readonly string[];
    }>,
  ): DynamicModule {
    const origin = new URL(options.siteOrigin);
    if (
      origin.origin !== options.siteOrigin ||
      !['http:', 'https:'].includes(origin.protocol) ||
      origin.username !== '' ||
      origin.password !== ''
    )
      throw new Error('NOTIFICATION_ORIGIN_INVALID');
    const repository = new PrismaNotificationsRepository(
      options.databaseUrl,
      Math.max(options.smtp.connectionTimeoutMs * 4, 120000),
    );
    const sender = new SmtpMailSender(options.smtp);
    return {
      module: NotificationsModule,
      providers: [
        DisabledSmsSender,
        {
          provide: NotificationsService,
          useValue: new NotificationsService(
            repository,
            sender,
            options.siteOrigin,
            options.enabledLocales,
          ),
        },
        { provide: Shutdown, useValue: new Shutdown(repository, sender) },
      ],
      exports: [NotificationsService, DisabledSmsSender],
    };
  }
}
