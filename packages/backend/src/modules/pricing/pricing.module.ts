import {
  type DynamicModule,
  Module,
  type OnApplicationShutdown,
  type Provider,
} from '@nestjs/common';

import { PricingService, type PricingConfig } from './application/pricing.service.js';
import type { PricingRepository } from './domain/pricing-repository.port.js';
import { PrismaPricingRepository } from './infrastructure/prisma-pricing.repository.js';

export type PricingModuleOptions = Readonly<{
  databaseUrl: string;
  config: PricingConfig;
  overrides?: Readonly<{ repository?: PricingRepository }>;
}>;

class PricingShutdownLifecycle implements OnApplicationShutdown {
  constructor(private readonly closeResources: () => Promise<void>) {}

  onApplicationShutdown(): Promise<void> {
    return this.closeResources();
  }
}

@Module({})
export class PricingModule {
  static register(options: PricingModuleOptions): DynamicModule {
    const ownedRepository =
      options.overrides?.repository === undefined
        ? new PrismaPricingRepository(options.databaseUrl)
        : undefined;
    const repository = options.overrides?.repository ?? ownedRepository;
    if (repository === undefined) throw new Error('Pricing module configuration failed.');
    const providers: Provider[] = [
      { provide: PricingService, useValue: new PricingService(repository, options.config) },
      {
        provide: PricingShutdownLifecycle,
        useValue: new PricingShutdownLifecycle(async () => {
          await ownedRepository?.close();
        }),
      },
    ];
    return { module: PricingModule, providers, exports: [PricingService] };
  }
}
