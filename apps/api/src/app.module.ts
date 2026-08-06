import { type DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import {
  IdentityModule,
  CatalogModule,
  MediaModule,
  PlatformModule,
  type DatabaseHealthPort,
} from '@honey/backend';
import type { GracefulShutdown } from './bootstrap/graceful-shutdown.js';
import type { ApiConfig } from './config/api-config.js';
import { PlatformController } from './modules/platform/platform.controller.js';
import { IdentityController } from './modules/identity/identity.controller.js';
import { MediaController } from './modules/media/media.controller.js';
import {
  AdminCatalogController,
  PublicCatalogController,
} from './modules/catalog/catalog.controller.js';
import { ValidationProbeController } from './testing/validation-probe.controller.js';
import { AuthorizationGuard } from './http/auth/authorization.guard.js';
import type { ControllerClass } from './http/auth/route-policy-verifier.js';

export type AppModuleOptions = Readonly<{
  config: ApiConfig;
  databaseHealthOverride?: DatabaseHealthPort;
  enableTestRoutes?: boolean;
  gracefulShutdown: GracefulShutdown;
}>;

@Module({})
export class AppModule {
  static controllers(enableTestRoutes: boolean): readonly ControllerClass[] {
    return enableTestRoutes
      ? [
          PlatformController,
          IdentityController,
          MediaController,
          PublicCatalogController,
          AdminCatalogController,
          ValidationProbeController,
        ]
      : [
          PlatformController,
          IdentityController,
          MediaController,
          PublicCatalogController,
          AdminCatalogController,
        ];
  }

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
        IdentityModule.register({
          config: options.config.identity.config,
          databaseUrl: options.config.databaseUrl,
          redisUrl: options.config.redisUrl,
          totpEncryptionKey: options.config.identity.totpEncryptionKey,
          breachedPasswordEndpoint: options.config.identity.breachedPasswordEndpoint,
          breachedPasswordTimeoutMs: options.config.identity.breachedPasswordTimeoutMs,
          smtp: options.config.identity.smtp,
        }),
        CatalogModule.register({
          config: options.config.catalog,
          databaseUrl: options.config.databaseUrl,
          redisUrl: options.config.redisUrl,
          mediaModule: MediaModule.register({
            config: options.config.media.config,
            storage: options.config.media.storage,
            databaseUrl: options.config.databaseUrl,
            redisUrl: options.config.redisUrl,
          }),
        }),
      ],
      controllers: [...AppModule.controllers(options.enableTestRoutes === true)],
      providers: [
        { provide: 'API_GRACEFUL_SHUTDOWN', useValue: options.gracefulShutdown },
        { provide: 'API_CONFIG', useValue: options.config },
        { provide: APP_GUARD, useClass: AuthorizationGuard },
      ],
    };
  }
}
