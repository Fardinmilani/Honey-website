import type { FastifyInstance } from 'fastify';
import type { Logger } from 'pino';

const REQUEST_STARTED = Symbol('request-started');

declare module 'fastify' {
  interface FastifyRequest {
    [REQUEST_STARTED]?: bigint;
  }
}

export function registerRequestLogging(fastify: FastifyInstance, logger: Logger): void {
  fastify.addHook('onRequest', async (request) => {
    request[REQUEST_STARTED] = process.hrtime.bigint();
  });
  fastify.addHook('onResponse', async (request, reply) => {
    const started = request[REQUEST_STARTED];
    const durationMs =
      started === undefined ? 0 : Number(process.hrtime.bigint() - started) / 1_000_000;
    logger.info(
      {
        method: request.method,
        route: request.routeOptions.url,
        status: reply.statusCode,
        durationMs,
        requestId: request.id,
      },
      'request.completed',
    );
  });
}
