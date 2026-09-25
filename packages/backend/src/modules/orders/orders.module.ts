import {
  type DynamicModule,
  Module,
  type OnApplicationShutdown,
  type Provider,
} from '@nestjs/common';

import { OrdersService } from './application/orders.service.js';
import type { OrdersRepository } from './domain/orders.js';
import { PrismaOrdersRepository } from './infrastructure/prisma-orders.repository.js';

export type OrdersModuleOptions = Readonly<{
  databaseUrl: string;
  overrides?: Readonly<{ repository?: OrdersRepository }>;
}>;

class OrdersShutdownLifecycle implements OnApplicationShutdown {
  constructor(private readonly closeResources: () => Promise<void>) {}

  onApplicationShutdown(): Promise<void> {
    return this.closeResources();
  }
}

@Module({})
export class OrdersModule {
  static register(options: OrdersModuleOptions): DynamicModule {
    const ownedRepository =
      options.overrides?.repository === undefined
        ? new PrismaOrdersRepository(options.databaseUrl)
        : undefined;
    const repository = options.overrides?.repository ?? ownedRepository;
    if (repository === undefined) throw new Error('Orders module configuration failed.');
    const providers: Provider[] = [
      { provide: OrdersService, useValue: new OrdersService(repository) },
      {
        provide: OrdersShutdownLifecycle,
        useValue: new OrdersShutdownLifecycle(async () => {
          await ownedRepository?.close();
        }),
      },
    ];
    return { module: OrdersModule, providers, exports: [OrdersService] };
  }
}
