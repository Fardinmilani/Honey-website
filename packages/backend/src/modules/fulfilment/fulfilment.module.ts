import {
  type DynamicModule,
  Module,
  type OnApplicationShutdown,
  type Provider,
} from '@nestjs/common';

import { InventoryService } from '../inventory/index.js';
import { OrdersService } from '../orders/index.js';
import { TRANSACTION_RUNNER } from '../../platform/domain/tokens.js';
import type { TransactionRunner } from '../../platform/domain/transaction.js';
import { ManualFlatShippingProvider, type ShippingProvider } from '../shipping/index.js';
import { FulfilmentService } from './application/fulfilment.service.js';
import type { FulfilmentNotificationPort, FulfilmentRepository } from './domain/fulfilment.js';
import { PrismaFulfilmentRepository } from './infrastructure/prisma-fulfilment.repository.js';

export type FulfilmentModuleOptions = Readonly<{
  databaseUrl: string;
  ordersModule: DynamicModule;
  inventoryModule: DynamicModule;
  platformModule: DynamicModule;
  notification: FulfilmentNotificationPort;
  overrides?: Readonly<{
    repository?: FulfilmentRepository;
    provider?: ShippingProvider;
  }>;
}>;

class FulfilmentShutdownLifecycle implements OnApplicationShutdown {
  constructor(private readonly closeResources: () => Promise<void>) {}

  onApplicationShutdown(): Promise<void> {
    return this.closeResources();
  }
}

@Module({})
export class FulfilmentModule {
  static register(options: FulfilmentModuleOptions): DynamicModule {
    const ownedRepository =
      options.overrides?.repository === undefined
        ? new PrismaFulfilmentRepository(options.databaseUrl)
        : undefined;
    const repository = options.overrides?.repository ?? ownedRepository;
    if (repository === undefined) throw new Error('Fulfilment module configuration failed.');
    const provider = options.overrides?.provider ?? new ManualFlatShippingProvider();
    const providers: Provider[] = [
      {
        provide: FulfilmentService,
        useFactory: (
          orders: OrdersService,
          inventory: InventoryService,
          transactions: TransactionRunner,
        ) =>
          new FulfilmentService(
            repository,
            orders,
            inventory,
            transactions,
            provider,
            options.notification,
          ),
        inject: [OrdersService, InventoryService, TRANSACTION_RUNNER],
      },
      {
        provide: FulfilmentShutdownLifecycle,
        useValue: new FulfilmentShutdownLifecycle(async () => {
          await ownedRepository?.close();
          await options.notification.close?.();
        }),
      },
    ];
    return {
      module: FulfilmentModule,
      imports: [options.ordersModule, options.inventoryModule, options.platformModule],
      providers,
      exports: [FulfilmentService],
    };
  }
}
