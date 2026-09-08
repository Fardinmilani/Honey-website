import {
  type DynamicModule,
  Module,
  type OnApplicationShutdown,
  type Provider,
} from '@nestjs/common';

import { InventoryService } from './application/inventory.service.js';
import {
  IncomingProjectionBinder,
  type IncomingProjectionPort,
  type InventoryRepository,
} from './domain/inventory.js';
import { PrismaInventoryRepository } from './infrastructure/prisma-inventory.repository.js';

export type InventoryModuleOverrides = Readonly<{
  repository?: InventoryRepository;
  incoming?: IncomingProjectionPort;
}>;

export type InventoryModuleOptions = Readonly<{
  databaseUrl: string;
  overrides?: InventoryModuleOverrides;
}>;

class InventoryShutdownLifecycle implements OnApplicationShutdown {
  constructor(private readonly closeResources: () => Promise<void>) {}

  onApplicationShutdown(): Promise<void> {
    return this.closeResources();
  }
}

@Module({})
export class InventoryModule {
  static register(options: InventoryModuleOptions): DynamicModule {
    const ownedRepository =
      options.overrides?.repository === undefined
        ? new PrismaInventoryRepository(options.databaseUrl)
        : undefined;
    const repository = options.overrides?.repository ?? ownedRepository;
    if (repository === undefined) throw new Error('Inventory module configuration failed.');
    const incomingBinder = new IncomingProjectionBinder();
    if (options.overrides?.incoming !== undefined) {
      incomingBinder.bind(options.overrides.incoming);
    }
    const providers: Provider[] = [
      {
        provide: IncomingProjectionBinder,
        useValue: incomingBinder,
      },
      {
        provide: InventoryService,
        useValue: new InventoryService(repository, incomingBinder),
      },
      {
        provide: InventoryShutdownLifecycle,
        useValue: new InventoryShutdownLifecycle(async () => {
          await ownedRepository?.close();
        }),
      },
    ];
    return {
      module: InventoryModule,
      providers,
      exports: [InventoryService, IncomingProjectionBinder],
    };
  }
}
