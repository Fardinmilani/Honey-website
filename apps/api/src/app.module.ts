import { type DynamicModule, Module } from '@nestjs/common';

import { PlatformModule, type DatabaseHealthPort } from '@honey/backend';
import type { GracefulShutdown } from './bootstrap/graceful-shutdown.js';
import type { ApiConfig } from './config/api-config.js';
import { PlatformController } from './modules/platform/platform.controller.js';
import { ValidationProbeController } from './testing/validation-probe.controller.js';

export type AppModuleOptions = Readonly<{
  config: ApiConfig;
  databaseHealthOverride?: DatabaseHealthPort;
  enableTestRoutes?: boolean;
  gracefulShutdown: GracefulShutdown;
}>;

@Module({})
export class AppModule {
  static register(options: AppModuleOptions): DynamicModule {
    return {
      module: AppModule,
      imports: [
        PlatformModule.register({
          databaseUrl: options.config.databaseUrl,
          readinessTimeoutMs: options.config.readinessTimeoutMs,
          ...(options.databaseHealthOverride === undefined
            ? {}
            : { databaseHealthOverride: options.databaseHealthOverride }),
        }),
      ],
      controllers:
        options.enableTestRoutes === true
          ? [PlatformController, ValidationProbeController]
          : [PlatformController],
      providers: [{ provide: 'API_GRACEFUL_SHUTDOWN', useValue: options.gracefulShutdown }],
    };
  }
}
