import { type DynamicModule, Module, type OnApplicationShutdown } from '@nestjs/common';

import { ShippingSettingsService } from './application/shipping-settings.service.js';
import { PrismaShippingSettingsRepository } from './infrastructure/prisma-shipping-settings.repository.js';

class ShippingShutdownLifecycle implements OnApplicationShutdown {
  constructor(private readonly closeResources: () => Promise<void>) {}
  onApplicationShutdown(): Promise<void> {
    return this.closeResources();
  }
}

@Module({})
export class ShippingModule {
  static register(options: Readonly<{ databaseUrl: string }>): DynamicModule {
    const repository = new PrismaShippingSettingsRepository(options.databaseUrl);
    return {
      module: ShippingModule,
      providers: [
        { provide: ShippingSettingsService, useValue: new ShippingSettingsService(repository) },
        {
          provide: ShippingShutdownLifecycle,
          useValue: new ShippingShutdownLifecycle(() => repository.close()),
        },
      ],
      exports: [ShippingSettingsService],
    };
  }
}
