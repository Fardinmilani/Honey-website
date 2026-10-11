import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';

import { ForbiddenAppError, IdentityService, type PermissionCode } from '@honey/backend';
import type { ApiConfig } from '../../config/api-config.js';
import { PUBLIC_ROUTE, REQUIRED_PERMISSIONS, REQUIRED_STAFF_SESSION } from './authorization.js';
import { InMemoryRateLimitStore, rateLimitError } from '../security/rate-limit.js';

@Injectable()
export class AuthorizationGuard implements CanActivate {
  private readonly adminWrites: InMemoryRateLimitStore;
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject('API_CONFIG') private readonly config: ApiConfig,
  ) {
    this.adminWrites = new InMemoryRateLimitStore(
      config.cart.writeRateLimitMax,
      config.rateLimit.windowMs,
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const handler = context.getHandler();
    const controller = context.getClass();
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [handler, controller]);
    const permissions = this.reflector.getAllAndOverride<readonly PermissionCode[]>(
      REQUIRED_PERMISSIONS,
      [handler, controller],
    );
    if (isPublic === true && permissions !== undefined) throw new ForbiddenAppError();
    if (isPublic === true) return true;
    if (permissions === undefined) throw new ForbiddenAppError();
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const principal = await this.identity.authenticateSession(
      request.cookies[this.config.sessionCookie.name],
    );
    if (
      this.reflector.getAllAndOverride<boolean>(REQUIRED_STAFF_SESSION, [handler, controller]) ===
        true &&
      principal.kind !== 'STAFF'
    ) {
      throw new ForbiddenAppError({ code: 'STAFF_REQUIRED' });
    }
    this.identity.authorize(principal, permissions);
    if (
      principal.kind === 'CUSTOMER' &&
      request.url.split('?')[0] === '/v1/me/reviews' &&
      request.method === 'POST'
    ) {
      const result = await this.adminWrites.consume(`review:${principal.userId}`, Date.now());
      if (!result.allowed) throw rateLimitError(result);
    }
    if (
      principal.kind === 'STAFF' &&
      request.url.split('?')[0]?.startsWith('/v1/admin/') &&
      !['GET', 'HEAD', 'OPTIONS'].includes(request.method)
    ) {
      const result = await this.adminWrites.consume(`admin:${principal.userId}`, Date.now());
      if (!result.allowed) throw rateLimitError(result);
    }
    request.authPrincipal = principal;
    return true;
  }
}
