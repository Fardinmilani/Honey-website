import {
  type DynamicModule,
  Module,
  type OnApplicationShutdown,
  type Provider,
} from '@nestjs/common';

import { IncomingProjectionBinder, InventoryService } from '../inventory/index.js';
import { ProcurementService } from './application/procurement.service.js';
import { PrismaProcurementRepository } from './infrastructure/prisma-procurement.repository.js';

export type ProcurementModuleOptions = Readonly<{
  databaseUrl: string;
  inventoryModule: DynamicModule;
}>;

class ProcurementShutdownLifecycle implements OnApplicationShutdown {
  constructor(private readonly closeResources: () => Promise<void>) {}

  onApplicationShutdown(): Promise<void> {
    return this.closeResources();
  }
}

@Module({})
export class ProcurementModule {
  static register(options: ProcurementModuleOptions): DynamicModule {
    const repository = new PrismaProcurementRepository(options.databaseUrl);
    const providers: Provider[] = [
      {
        provide: ProcurementService,
        inject: [InventoryService, IncomingProjectionBinder],
        useFactory: (inventory: InventoryService, incoming: IncomingProjectionBinder) => {
          const service = new ProcurementService(repository, inventory);
          incoming.bind(service);
          return service;
        },
      },
      {
        provide: ProcurementShutdownLifecycle,
        useValue: new ProcurementShutdownLifecycle(async () => repository.close()),
      },
    ];
    return {
      module: ProcurementModule,
      imports: [options.inventoryModule],
      providers,
      exports: [ProcurementService],
    };
  }
}
