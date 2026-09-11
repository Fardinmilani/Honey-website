import { createHash } from 'node:crypto';

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import {
  ValidationAppError,
  type CartTamperingAttempt,
  type RequestContextPort,
} from '@honey/backend';
import type { ApiConfig } from '../../config/api-config.js';
import { verifyCsrf } from './csrf.js';
import { InMemoryRateLimitStore, rateLimitError, type RateLimitStore } from './rate-limit.js';

const OPERATIONAL_PATHS = new Set(['/healthz', '/readyz']);
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const CART_ROUTE_PREFIX = '/v1/cart';
const WATCHED_CART_FIELD_TOKENS = [
  'price',
  'amount',
  'total',
  'discount',
  'shipping',
  'tax',
  'stock',
  'inventory',
  'available',
  'onhand',
  'reserved',
  'allocated',
  'payment',
];
const MAX_CART_TAMPERING_OBJECTS = 10_000;

export interface CartTamperingRecorder {
  recordTamperingAttempt(input: CartTamperingAttempt): Promise<void>;
}

export interface CartTamperingPrincipalResolver {
  authenticateSession(rawToken: string | undefined): Promise<Readonly<{ userId: string }>>;
}

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

function pathOf(request: FastifyRequest): string {
  return request.url.split('?')[0] ?? '/';
}

function isCartPath(request: FastifyRequest): boolean {
  const path = pathOf(request);
  return path === CART_ROUTE_PREFIX || path.startsWith(`${CART_ROUTE_PREFIX}/`);
}

function isCartWrite(request: FastifyRequest): boolean {
  return isCartPath(request) && !SAFE_METHODS.has(request.method.toUpperCase());
}

function rateKey(request: FastifyRequest, config: ApiConfig): string {
  const session = request.cookies[config.sessionCookie.name];
  const cart = request.cookies[config.cart.cookie.name];
  const identity = session ?? cart ?? request.ip;
  return createHash('sha256').update(identity).digest('base64url');
}

async function cartTamperingActorUserId(
  request: FastifyRequest,
  config: ApiConfig,
  principalResolver: CartTamperingPrincipalResolver | undefined,
): Promise<string | null> {
  const session = request.cookies[config.sessionCookie.name];
  if (session === undefined || principalResolver === undefined) return null;
  try {
    return (await principalResolver.authenticateSession(session)).userId;
  } catch {
    // Invalid or expired credentials do not turn a tampering rejection into an authentication error.
    return null;
  }
}

function watchedField(body: unknown): string | null {
  const pending: unknown[] = [body];
  const visited = new WeakSet<object>();
  let objectsScanned = 0;

  while (pending.length > 0) {
    const current = pending.pop();
    if (current === null || typeof current !== 'object' || visited.has(current)) continue;
    visited.add(current);
    objectsScanned += 1;
    if (objectsScanned > MAX_CART_TAMPERING_OBJECTS) return 'payload';

    if (Array.isArray(current)) {
      for (const item of current) pending.push(item);
      continue;
    }
    for (const [key, value] of Object.entries(current)) {
      const normalized = key.replace(/[_-]/gu, '').toLowerCase();
      if (WATCHED_CART_FIELD_TOKENS.some((token) => normalized.includes(token))) return key;
      pending.push(value);
    }
  }
  return null;
}

export function registerSecurityHooks(
  fastify: FastifyInstance,
  config: ApiConfig,
  requestContext: RequestContextPort,
  rateLimitStore: RateLimitStore = new InMemoryRateLimitStore(
    config.rateLimit.max,
    config.rateLimit.windowMs,
  ),
  cartTamperingRecorder?: CartTamperingRecorder,
  cartTamperingPrincipalResolver?: CartTamperingPrincipalResolver,
): void {
  const cartWriteRateLimit = new InMemoryRateLimitStore(
    config.cart.writeRateLimitMax,
    config.rateLimit.windowMs,
  );
  const couponRateLimit = new InMemoryRateLimitStore(
    config.cart.couponRateLimitMax,
    config.rateLimit.windowMs,
  );
  fastify.addHook('onRequest', (request, _reply, done) => {
    requestContext.run({ requestId: request.id }, done);
  });

  fastify.addHook('onRequest', async (request, reply) => {
    const path = pathOf(request);
    if (OPERATIONAL_PATHS.has(path)) return;
    const result = await rateLimitStore.consume(request.ip, Date.now());
    setRateHeaders(reply, result);
    if (!result.allowed) throw rateLimitError(result);
    if (!isCartWrite(request)) return;
    const cartResult = await cartWriteRateLimit.consume(
      `cart:${rateKey(request, config)}`,
      Date.now(),
    );
    setRateHeaders(reply, cartResult);
    if (!cartResult.allowed) throw rateLimitError(cartResult);
    if (path === '/v1/cart/coupon') {
      const couponResult = await couponRateLimit.consume(
        `coupon:${rateKey(request, config)}`,
        Date.now(),
      );
      setRateHeaders(reply, couponResult);
      if (!couponResult.allowed) throw rateLimitError(couponResult);
    }
  });

  fastify.addHook('preValidation', async (request) => {
    if (!isCartWrite(request)) return;
    const offendingField = watchedField(request.body);
    if (offendingField === null) return;
    const anonymousId = request.cookies[config.cart.cookie.name];
    if (cartTamperingRecorder !== undefined) {
      await cartTamperingRecorder.recordTamperingAttempt({
        actorUserId: await cartTamperingActorUserId(
          request,
          config,
          cartTamperingPrincipalResolver,
        ),
        requestId: request.id,
        clientIp: request.ip,
        offendingField,
        ...(anonymousId === undefined ? {} : { anonymousId }),
      });
    }
    throw new ValidationAppError([{ path: offendingField, code: 'CART_MONEY_FIELD_FORBIDDEN' }]);
  });

  fastify.addHook('preValidation', async (request) => {
    const path = pathOf(request);
    const hasSessionCookie = request.cookies[config.sessionCookie.name] !== undefined;
    verifyCsrf({
      method: request.method,
      cookieToken: request.cookies[config.csrf.cookieName],
      headerToken: headerValue(request, config.csrf.headerName),
      exempt: OPERATIONAL_PATHS.has(path) || (!hasSessionCookie && !isCartWrite(request)),
    });
  });

  fastify.addHook('onSend', async (request, reply, payload) => {
    reply.header('X-Request-Id', request.id);
    const path = pathOf(request);
    if (path.startsWith('/v1/admin/') || isCartPath(request)) {
      reply.header('Cache-Control', 'private, no-store');
    }
    return payload;
  });
}
