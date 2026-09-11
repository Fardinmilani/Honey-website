import {
  type DynamicModule,
  Module,
  type OnApplicationShutdown,
  type Provider,
} from '@nestjs/common';

import { MediaModule, MediaService } from '../media/index.js';
import { InventoryService } from '../inventory/index.js';
import { PricingService } from '../pricing/index.js';
import { CatalogService } from './application/catalog.service.js';
import type { CatalogAvailabilityPort } from './domain/catalog-availability.port.js';
import type { CatalogCache } from './domain/catalog-cache.port.js';
import type { CatalogMediaPort } from './domain/catalog-media.port.js';
import type { CatalogPricingPort } from './domain/catalog-pricing.port.js';
import type { CatalogConfig } from './domain/catalog.js';
import type { CatalogRepository } from './domain/catalog-repository.port.js';
import { InventoryCatalogAvailabilityAdapter } from './infrastructure/inventory-catalog-availability.adapter.js';
import { MediaCatalogAdapter } from './infrastructure/media-catalog.adapter.js';
import { PrismaCatalogRepository } from './infrastructure/prisma-catalog.repository.js';
import { PricingCatalogAdapter } from './infrastructure/pricing-catalog.adapter.js';
import { RedisCatalogCache } from './infrastructure/redis-catalog-cache.adapter.js';

export type CatalogModuleOverrides = Readonly<{
  repository?: CatalogRepository;
  cache?: CatalogCache;
  media?: CatalogMediaPort;
  availability?: CatalogAvailabilityPort;
  pricing?: CatalogPricingPort;
}>;

export type CatalogModuleOptions = Readonly<{
  config: CatalogConfig;
  databaseUrl: string;
  redisUrl: string;
  mediaModule?: DynamicModule;
  inventoryModule?: DynamicModule;
  pricingModule?: DynamicModule;
  overrides?: CatalogModuleOverrides;
}>;

class CatalogShutdownLifecycle implements OnApplicationShutdown {
  constructor(private readonly closeResources: () => Promise<void>) {}

  onApplicationShutdown(): Promise<void> {
    return this.closeResources();
  }
}

@Module({})
export class CatalogModule {
  static register(options: CatalogModuleOptions): DynamicModule {
    const ownedRepository =
      options.overrides?.repository === undefined
        ? new PrismaCatalogRepository(options.databaseUrl)
        : undefined;
    const repository = options.overrides?.repository ?? ownedRepository;
    const ownedCache =
      options.overrides?.cache === undefined
        ? new RedisCatalogCache(options.redisUrl, options.config.cacheNamespace)
        : undefined;
    const cache = options.overrides?.cache ?? ownedCache;
    if (repository === undefined || cache === undefined) {
      throw new Error('Catalog module configuration failed.');
    }
    const inject: (typeof MediaService | typeof InventoryService | typeof PricingService)[] = [];
    if (options.overrides?.media === undefined) inject.push(MediaService);
    if (options.overrides?.availability === undefined && options.inventoryModule !== undefined) {
      inject.push(InventoryService);
    }
    if (options.overrides?.pricing === undefined && options.pricingModule !== undefined) {
      inject.push(PricingService);
    }
    const providers: Provider[] = [
      {
        provide: CatalogService,
        inject,
        useFactory: (...dependencies: unknown[]) => {
          let offset = 0;
          const mediaService =
            options.overrides?.media === undefined
              ? (dependencies[offset++] as MediaService | undefined)
              : undefined;
          const inventoryService =
            options.overrides?.availability === undefined && options.inventoryModule !== undefined
              ? (dependencies[offset++] as InventoryService | undefined)
              : undefined;
          const pricingService =
            options.overrides?.pricing === undefined && options.pricingModule !== undefined
              ? (dependencies[offset++] as PricingService | undefined)
              : undefined;
          const media =
            options.overrides?.media ??
            (mediaService === undefined ? undefined : new MediaCatalogAdapter(mediaService));
          if (media === undefined) throw new Error('Catalog media boundary is not configured.');
          const availability =
            options.overrides?.availability ??
            (inventoryService === undefined
              ? undefined
              : new InventoryCatalogAvailabilityAdapter(inventoryService));
          const pricing =
            options.overrides?.pricing ??
            (pricingService === undefined ? undefined : new PricingCatalogAdapter(pricingService));
          return new CatalogService(
            options.config,
            repository,
            cache,
            media,
            availability,
            pricing,
          );
        },
      },
      {
        provide: CatalogShutdownLifecycle,
        useValue: new CatalogShutdownLifecycle(async () => {
          await Promise.allSettled([ownedRepository?.close(), ownedCache?.close()]);
        }),
      },
    ];
    return {
      module: CatalogModule,
      imports: [
        ...(options.mediaModule === undefined ? [] : [options.mediaModule]),
        ...(options.inventoryModule === undefined ? [] : [options.inventoryModule]),
        ...(options.pricingModule === undefined ? [] : [options.pricingModule]),
      ],
      providers,
      exports: [CatalogService, ...(options.mediaModule === undefined ? [] : [MediaModule])],
    };
  }
}
