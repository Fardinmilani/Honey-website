import {
  type DynamicModule,
  Module,
  type OnApplicationShutdown,
  type Provider,
} from '@nestjs/common';

import { InventoryService } from '../inventory/index.js';
import { SourcingService } from './application/sourcing.service.js';
import type { SourcingRepository } from './domain/sourcing-repository.port.js';
import { PrismaSourcingRepository } from './infrastructure/prisma-sourcing.repository.js';

export type SourcingModuleOptions = Readonly<{
  databaseUrl: string;
  inventoryModule?: DynamicModule;
  overrides?: Readonly<{ repository?: SourcingRepository }>;
}>;

class SourcingShutdownLifecycle implements OnApplicationShutdown {
  constructor(private readonly closeResources: () => Promise<void>) {}

  onApplicationShutdown(): Promise<void> {
    return this.closeResources();
  }
}

@Module({})
export class SourcingModule {
  static register(options: SourcingModuleOptions): DynamicModule {
    const ownedRepository =
      options.overrides?.repository === undefined
        ? new PrismaSourcingRepository(options.databaseUrl)
        : undefined;
    const repository = options.overrides?.repository ?? ownedRepository;
    if (repository === undefined) throw new Error('Sourcing module configuration failed.');
    const providers: Provider[] = [
      {
        provide: SourcingService,
        inject: options.inventoryModule === undefined ? [] : [InventoryService],
        useFactory: (inventory?: InventoryService) => new SourcingService(repository, inventory),
      },
      {
        provide: SourcingShutdownLifecycle,
        useValue: new SourcingShutdownLifecycle(async () => {
          await ownedRepository?.close();
        }),
      },
    ];
    return {
      module: SourcingModule,
      imports: options.inventoryModule === undefined ? [] : [options.inventoryModule],
      providers,
      exports: [SourcingService],
    };
  }
}
