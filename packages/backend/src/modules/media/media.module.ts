import {
  type DynamicModule,
  Module,
  type OnApplicationShutdown,
  type Provider,
} from '@nestjs/common';

import { MediaService } from './application/media.service.js';
import type { ContentInspector } from './domain/content-inspector.port.js';
import type { MediaConfig } from './domain/media.js';
import type { MediaRepository } from './domain/media-repository.port.js';
import type { MediaAuditPort } from './domain/media-audit.port.js';
import type { MediaProcessor } from './domain/media-processor.port.js';
import type { StorageService } from './domain/storage.port.js';
import type { UploadIntentStore } from './domain/upload-intent.port.js';
import { MagicContentInspector } from './infrastructure/magic-content-inspector.js';
import { IdentityMediaAuditAdapter } from './infrastructure/identity-media-audit.adapter.js';
import { PrismaMediaRepository } from './infrastructure/prisma-media.repository.js';
import { RedisUploadIntentAdapter } from './infrastructure/redis-upload-intent.adapter.js';
import { S3StorageAdapter, type S3StorageConfig } from './infrastructure/s3-storage.adapter.js';
import { SharpMediaProcessor } from './infrastructure/sharp-media-processor.js';

export type MediaModuleOverrides = Readonly<{
  storage?: StorageService;
  intents?: UploadIntentStore;
  repository?: MediaRepository;
  inspector?: ContentInspector;
  processor?: MediaProcessor;
  audit?: MediaAuditPort;
  now?: () => Date;
}>;

export type MediaModuleOptions = Readonly<{
  config: MediaConfig;
  storage: S3StorageConfig;
  databaseUrl: string;
  redisUrl: string;
  overrides?: MediaModuleOverrides;
}>;

class MediaShutdownLifecycle implements OnApplicationShutdown {
  constructor(private readonly closeResources: () => Promise<void>) {}

  onApplicationShutdown(): Promise<void> {
    return this.closeResources();
  }
}

@Module({})
export class MediaModule {
  static register(options: MediaModuleOptions): DynamicModule {
    const ownedStorage =
      options.overrides?.storage === undefined ? new S3StorageAdapter(options.storage) : undefined;
    const storage = options.overrides?.storage ?? ownedStorage;
    const ownedIntents =
      options.overrides?.intents === undefined
        ? new RedisUploadIntentAdapter(options.redisUrl)
        : undefined;
    const intents = options.overrides?.intents ?? ownedIntents;
    const ownedRepository =
      options.overrides?.repository === undefined
        ? new PrismaMediaRepository(options.databaseUrl, options.config.publicBaseUrl)
        : undefined;
    const repository = options.overrides?.repository ?? ownedRepository;
    const inspector = options.overrides?.inspector ?? new MagicContentInspector();
    const processor = options.overrides?.processor ?? new SharpMediaProcessor(options.config);
    const ownedAudit =
      options.overrides?.audit === undefined
        ? new IdentityMediaAuditAdapter(options.databaseUrl)
        : undefined;
    const audit = options.overrides?.audit ?? ownedAudit;
    if (
      storage === undefined ||
      intents === undefined ||
      repository === undefined ||
      audit === undefined
    ) {
      throw new Error('Media module configuration failed.');
    }
    const service = new MediaService({
      config: options.config,
      storage,
      intents,
      repository,
      inspector,
      processor,
      audit,
      ...(options.overrides?.now === undefined ? {} : { now: options.overrides.now }),
    });
    const providers: Provider[] = [
      { provide: MediaService, useValue: service },
      {
        provide: MediaShutdownLifecycle,
        useValue: new MediaShutdownLifecycle(async () => {
          await Promise.allSettled([
            ownedStorage?.close(),
            ownedIntents?.close(),
            ownedRepository?.close(),
            ownedAudit?.close(),
          ]);
        }),
      },
    ];
    return { module: MediaModule, providers, exports: [MediaService] };
  }
}
