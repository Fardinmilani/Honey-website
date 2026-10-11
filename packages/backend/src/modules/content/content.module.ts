import { Module, type DynamicModule, type OnApplicationShutdown } from '@nestjs/common';
import { MediaService } from '../media/index.js';
import { ContentService } from './application/content.service.js';
import { PrismaContentRepository } from './infrastructure/prisma-content.repository.js';
import { RedisContentCache } from './infrastructure/redis-content-cache.js';
import { ContentCacheInvalidationService } from './application/content-cache-invalidation.service.js';
class Shutdown implements OnApplicationShutdown {
  constructor(
    private readonly repository: PrismaContentRepository | null,
    private readonly cache: RedisContentCache,
  ) {}
  async onApplicationShutdown() {
    await Promise.allSettled([this.repository?.close(), this.cache.close()]);
  }
}
@Module({})
export class ContentModule {
  static registerWorkerRevalidation(redisUrl: string, cacheNamespace?: string): DynamicModule {
    const cache = new RedisContentCache(redisUrl, cacheNamespace);
    return {
      module: ContentModule,
      providers: [
        {
          provide: ContentCacheInvalidationService,
          useValue: new ContentCacheInvalidationService(cache),
        },
        { provide: Shutdown, useValue: new Shutdown(null, cache) },
      ],
      exports: [ContentCacheInvalidationService],
    };
  }
  static register(
    options: Readonly<{
      databaseUrl: string;
      redisUrl: string;
      cacheNamespace?: string;
      enabledLocales: readonly string[];
      mediaModule: DynamicModule;
    }>,
  ): DynamicModule {
    const repository = new PrismaContentRepository(options.databaseUrl);
    const cache = new RedisContentCache(options.redisUrl, options.cacheNamespace);
    return {
      module: ContentModule,
      imports: [options.mediaModule],
      providers: [
        {
          provide: ContentService,
          inject: [MediaService],
          useFactory: (media: MediaService) =>
            new ContentService(repository, media, options.enabledLocales, cache),
        },
        { provide: Shutdown, useValue: new Shutdown(repository, cache) },
      ],
      exports: [ContentService],
    };
  }
}
