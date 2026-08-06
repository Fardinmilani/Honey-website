import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { RequestContextPort } from '@honey/backend';
import type { ApiConfig } from '../../config/api-config.js';
import { verifyCsrf } from './csrf.js';
import { InMemoryRateLimitStore, rateLimitError, type RateLimitStore } from './rate-limit.js';

const OPERATIONAL_PATHS = new Set(['/healthz', '/readyz']);

function headerValue(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  return typeof value === 'string' ? value : undefined;
}

function setRateHeaders(
  reply: FastifyReply,
  result: Awaited<ReturnType<RateLimitStore['consume']>>,
): void {
  reply.header('RateLimit-Limit', String(result.limit));
  reply.header('RateLimit-Remaining', String(result.remaining));
  reply.header('RateLimit-Reset', String(Math.ceil(result.resetAtMs / 1_000)));
}

export function registerSecurityHooks(
  fastify: FastifyInstance,
  config: ApiConfig,
  requestContext: RequestContextPort,
  rateLimitStore: RateLimitStore = new InMemoryRateLimitStore(
    config.rateLimit.max,
    config.rateLimit.windowMs,
  ),
): void {
  fastify.addHook('onRequest', (request, _reply, done) => {
    requestContext.run({ requestId: request.id }, done);
  });

  fastify.addHook('onRequest', async (request, reply) => {
    const path = request.url.split('?')[0] ?? '/';
    if (OPERATIONAL_PATHS.has(path)) return;
    const result = await rateLimitStore.consume(request.ip, Date.now());
    setRateHeaders(reply, result);
    if (!result.allowed) throw rateLimitError(result);
  });

  fastify.addHook('preValidation', async (request) => {
    const path = request.url.split('?')[0] ?? '/';
    const hasSessionCookie = request.cookies[config.sessionCookie.name] !== undefined;
    verifyCsrf({
      method: request.method,
      cookieToken: request.cookies[config.csrf.cookieName],
      headerToken: headerValue(request, config.csrf.headerName),
      exempt: OPERATIONAL_PATHS.has(path) || !hasSessionCookie,
    });
  });

  fastify.addHook('onSend', async (request, reply, payload) => {
    reply.header('X-Request-Id', request.id);
    if ((request.url.split('?')[0] ?? '/').startsWith('/v1/admin/')) {
      reply.header('Cache-Control', 'private, no-store');
    }
    return payload;
  });
}
