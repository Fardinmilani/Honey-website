import {
  type DynamicModule,
  Module,
  type OnApplicationShutdown,
  type Provider,
} from '@nestjs/common';

import { HealthService } from './application/health.service.js';
import type { DatabaseHealthPort } from './domain/database-health.port.js';
import { GracefulResourceRegistry } from './domain/graceful-resource.js';
import type { PlatformConfig } from './domain/config.js';
import {
  DATABASE_HEALTH_PORT,
  GRACEFUL_RESOURCE_REGISTRY,
  REQUEST_CONTEXT,
  TRANSACTION_RUNNER,
} from './domain/tokens.js';
import { PrismaPlatformAdapter } from './infrastructure/prisma-platform.adapter.js';
import { RequestContextStorage } from './infrastructure/request-context.storage.js';

export type PlatformModuleOptions = PlatformConfig &
  Readonly<{ databaseHealthOverride?: DatabaseHealthPort }>;

class BackendShutdownLifecycle implements OnApplicationShutdown {
  constructor(private readonly resources: GracefulResourceRegistry) {}

  async onApplicationShutdown(): Promise<void> {
    await this.resources.close();
  }
}

@Module({})
export class PlatformModule {
  static register(options: PlatformModuleOptions): DynamicModule {
    const adapter = new PrismaPlatformAdapter(options.databaseUrl);
    const resources = new GracefulResourceRegistry();
    resources.add(adapter);
    const databaseHealth = options.databaseHealthOverride ?? adapter;
    const providers: Provider[] = [
      { provide: DATABASE_HEALTH_PORT, useValue: databaseHealth },
      { provide: TRANSACTION_RUNNER, useValue: adapter },
      { provide: REQUEST_CONTEXT, useClass: RequestContextStorage },
      { provide: GRACEFUL_RESOURCE_REGISTRY, useValue: resources },
      {
        provide: HealthService,
        useFactory: (port: DatabaseHealthPort) =>
          new HealthService(port, options.readinessTimeoutMs),
        inject: [DATABASE_HEALTH_PORT],
      },
      {
        provide: BackendShutdownLifecycle,
        useFactory: () => new BackendShutdownLifecycle(resources),
      },
    ];
    return {
      module: PlatformModule,
      providers,
      exports: [HealthService, TRANSACTION_RUNNER, REQUEST_CONTEXT, GRACEFUL_RESOURCE_REGISTRY],
    };
  }
}
