import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';

import { ForbiddenAppError, IdentityService, type PermissionCode } from '@honey/backend';
import type { ApiConfig } from '../../config/api-config.js';
import { PUBLIC_ROUTE, REQUIRED_PERMISSIONS } from './authorization.js';

@Injectable()
export class AuthorizationGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject('API_CONFIG') private readonly config: ApiConfig,
  ) {}

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
    this.identity.authorize(principal, permissions);
    request.authPrincipal = principal;
    return true;
  }
}
