import {
  UnauthenticatedAppError,
  type AuthenticatedPrincipal,
  type RequestMetadata,
} from '@honey/backend';
import type { FastifyRequest } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    authPrincipal?: AuthenticatedPrincipal;
  }
}

export function requestPrincipal(request: FastifyRequest): AuthenticatedPrincipal {
  if (request.authPrincipal === undefined) throw new UnauthenticatedAppError();
  return request.authPrincipal;
}

export function requestMetadata(request: FastifyRequest): RequestMetadata {
  const userAgent = request.headers['user-agent'];
  return {
    requestId: request.id,
    clientIp: request.ip,
    ...(typeof userAgent === 'string' ? { userAgent } : {}),
  };
}
