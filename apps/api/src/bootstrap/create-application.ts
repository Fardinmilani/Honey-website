import 'reflect-metadata';

import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import { REQUEST_CONTEXT, type DatabaseHealthPort, type RequestContextPort } from '@honey/backend';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Logger } from 'pino';

import { AppModule } from '../app.module.js';
import { GracefulShutdown, installSignalHandlers } from './graceful-shutdown.js';
import type { ApiConfig } from '../config/api-config.js';
import { ProblemExceptionFilter } from '../http/errors/problem.filter.js';
import { createApiLogger, PinoNestLogger } from '../http/logging/api-logger.js';
import { registerRequestLogging } from '../http/logging/request-logging.js';
import { requestIdFromIncoming } from '../http/logging/request-id.js';
import { registerSecurityHooks } from '../http/security/security-hooks.js';
import type { RateLimitStore } from '../http/security/rate-limit.js';
import { createGlobalValidationPipe } from '../http/validation/global-validation.js';
import { assertControllerAuthorizationPolicies } from '../http/auth/route-policy-verifier.js';

export type CreateApiApplicationOptions = Readonly<{
  config: ApiConfig;
  databaseHealthOverride?: DatabaseHealthPort;
  rateLimitStore?: RateLimitStore;
  enableTestRoutes?: boolean;
  logger?: Logger;
  loggerDestination?: NodeJS.WritableStream;
  enableShutdownHooks?: boolean;
}>;

export async function createApiApplication(
  options: CreateApiApplicationOptions,
): Promise<NestFastifyApplication> {
  assertControllerAuthorizationPolicies(AppModule.controllers(options.enableTestRoutes === true));
  const logger = options.logger ?? createApiLogger(options.config, options.loggerDestination);
  const gracefulShutdown = new GracefulShutdown(options.config.shutdownGraceMs, logger);
  const adapter = new FastifyAdapter({
    bodyLimit: options.config.bodyLimitBytes,
    trustProxy: options.config.trustProxy,
    genReqId: requestIdFromIncoming,
    logger: false,
    forceCloseConnections: 'idle',
  });
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.register({
      config: options.config,
      gracefulShutdown,
      ...(options.databaseHealthOverride === undefined
        ? {}
        : { databaseHealthOverride: options.databaseHealthOverride }),
      ...(options.enableTestRoutes === undefined
        ? {}
        : { enableTestRoutes: options.enableTestRoutes }),
    }),
    adapter,
    { bufferLogs: false, logger: new PinoNestLogger(logger), abortOnError: true },
  );
  if (options.enableShutdownHooks === true) {
    app.enableShutdownHooks(['SIGTERM', 'SIGINT'], { useProcessExit: true });
    installSignalHandlers(gracefulShutdown);
  }
  await app.register(cookie);
  await app.register(helmet, {
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginResourcePolicy: { policy: 'same-origin' },
    frameguard: { action: 'deny' },
    hsts:
      options.config.nodeEnv === 'production'
        ? { maxAge: 63_072_000, includeSubDomains: true, preload: true }
        : false,
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  });
  app.enableCors({
    credentials: true,
    origin: (origin, callback) => {
      if (origin === undefined || options.config.allowedOrigins.includes(origin))
        callback(null, true);
      else callback(null, false);
    },
  });
  app.useGlobalPipes(createGlobalValidationPipe());
  app.useGlobalFilters(new ProblemExceptionFilter(logger));
  const fastify = app.getHttpAdapter().getInstance();
  fastify.addHook('onSend', async (_request, reply, payload) => {
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    return payload;
  });
  const requestContext = app.get<RequestContextPort>(REQUEST_CONTEXT);
  registerSecurityHooks(fastify, options.config, requestContext, options.rateLimitStore);
  registerRequestLogging(fastify, logger);
  return app;
}
