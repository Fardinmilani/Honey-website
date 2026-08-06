import {
  type DynamicModule,
  Module,
  type OnApplicationShutdown,
  type Provider,
} from '@nestjs/common';

import { MediaModule, MediaService } from '../media/index.js';
import { CatalogService } from './application/catalog.service.js';
import type { CatalogCache } from './domain/catalog-cache.port.js';
import type { CatalogMediaPort } from './domain/catalog-media.port.js';
import type { CatalogConfig } from './domain/catalog.js';
import type { CatalogRepository } from './domain/catalog-repository.port.js';
import { MediaCatalogAdapter } from './infrastructure/media-catalog.adapter.js';
import { PrismaCatalogRepository } from './infrastructure/prisma-catalog.repository.js';
import { RedisCatalogCache } from './infrastructure/redis-catalog-cache.adapter.js';

export type CatalogModuleOverrides = Readonly<{
  repository?: CatalogRepository;
  cache?: CatalogCache;
  media?: CatalogMediaPort;
}>;

export type CatalogModuleOptions = Readonly<{
  config: CatalogConfig;
  databaseUrl: string;
  redisUrl: string;
  mediaModule?: DynamicModule;
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
    const providers: Provider[] = [
      {
        provide: CatalogService,
        inject: options.overrides?.media === undefined ? [MediaService] : [],
        useFactory: (mediaService?: MediaService) => {
          const media =
            options.overrides?.media ??
            (mediaService === undefined ? undefined : new MediaCatalogAdapter(mediaService));
          if (media === undefined) throw new Error('Catalog media boundary is not configured.');
          return new CatalogService(options.config, repository, cache, media);
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
      imports: options.mediaModule === undefined ? [] : [options.mediaModule],
      providers,
      exports: [CatalogService, ...(options.mediaModule === undefined ? [] : [MediaModule])],
    };
  }
}
