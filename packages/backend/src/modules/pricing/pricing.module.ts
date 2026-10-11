import {
  type DynamicModule,
  Module,
  type OnApplicationShutdown,
  type Provider,
} from '@nestjs/common';

import { PricingService, type PricingConfig } from './application/pricing.service.js';
import { IdentityService } from '../identity/index.js';
import { PrismaAuditWriter } from '../identity/index.js';
import { PrismaPlatformAdapter } from '../../platform/index.js';
import { AdminPricingService } from './application/admin-pricing.service.js';
import { PrismaAdminPricingRepository } from './infrastructure/prisma-admin-pricing.repository.js';
import type { PricingRepository } from './domain/pricing-repository.port.js';
import { PrismaPricingRepository } from './infrastructure/prisma-pricing.repository.js';

export type PricingModuleOptions = Readonly<{
  databaseUrl: string;
  config: PricingConfig;
  identityModule?: DynamicModule;
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
    const adminRepository = new PrismaAdminPricingRepository(options.databaseUrl);
    const audit = new PrismaAuditWriter(options.databaseUrl);
    const transactions = new PrismaPlatformAdapter(options.databaseUrl);
    const providers: Provider[] = [
      {
        provide: AdminPricingService,
        useValue: new AdminPricingService(adminRepository, audit, transactions),
      },
      options.identityModule === undefined
        ? { provide: PricingService, useValue: new PricingService(repository, options.config) }
        : {
            provide: PricingService,
            inject: [IdentityService],
            useFactory: (identity: IdentityService) =>
              new PricingService(repository, options.config, identity),
          },
      {
        provide: PricingShutdownLifecycle,
        useValue: new PricingShutdownLifecycle(async () => {
          await ownedRepository?.close();
          await Promise.allSettled([adminRepository.close(), audit.close(), transactions.close()]);
        }),
      },
    ];
    return {
      module: PricingModule,
      imports: options.identityModule === undefined ? [] : [options.identityModule],
      providers,
      exports: [PricingService, AdminPricingService],
    };
  }
}
