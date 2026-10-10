import { type DynamicModule, Module } from '@nestjs/common';

import {
  FulfilmentModule,
  InventoryModule,
  OrdersModule,
  PaymentsModule,
  PlatformModule,
  ProcurementModule,
  SitemapRevalidationService,
  SmtpFulfilmentNotificationAdapter,
} from '@honey/backend';

import type { WorkerConfig } from './config.js';
import { FixedWebRevalidationAdapter } from './web-revalidation.adapter.js';

export class WorkerModule {
  static register(config: WorkerConfig): DynamicModule {
    const platformModule = PlatformModule.register({
      databaseUrl: config.databaseUrl,
      readinessTimeoutMs: 5_000,
    });
    const inventoryModule = InventoryModule.register({ databaseUrl: config.databaseUrl });
    const ordersModule = OrdersModule.register({ databaseUrl: config.databaseUrl });
    return {
      module: WorkerModule,
      imports: [
        platformModule,
        inventoryModule,
        ProcurementModule.register({ databaseUrl: config.databaseUrl, inventoryModule }),
        ordersModule,
        PaymentsModule.registerWorkerReconciliation({
          databaseUrl: config.databaseUrl,
          defaultProvider: config.payment.provider,
          callbackUrl: config.payment.callbackUrl,
          requestTimeoutMs: config.payment.requestTimeoutMs,
          reconciliationMinAgeMs: config.payment.reconciliationMinAgeMs,
          zarinpal: config.payment.zarinpal,
          platformModule,
        }),
        FulfilmentModule.register({
          databaseUrl: config.databaseUrl,
          ordersModule,
          inventoryModule,
          platformModule,
          notification: new SmtpFulfilmentNotificationAdapter(config.databaseUrl, config.smtp),
        }),
      ],
      providers: [
        {
          provide: SitemapRevalidationService,
          useValue: new SitemapRevalidationService(
            new FixedWebRevalidationAdapter(config.webOrigin, config.revalidationSecret),
          ),
        },
      ],
      exports: [SitemapRevalidationService],
    };
  }
}

Module({})(WorkerModule);
