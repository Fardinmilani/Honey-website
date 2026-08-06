import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiSecurity } from '@nestjs/swagger';

import type { PermissionCode } from '@honey/backend';

export const PUBLIC_ROUTE = Symbol('PUBLIC_ROUTE');
export const REQUIRED_PERMISSIONS = Symbol('REQUIRED_PERMISSIONS');

export function Public(): MethodDecorator {
  return SetMetadata(PUBLIC_ROUTE, true);
}

export function RequirePermissions(...permissions: readonly PermissionCode[]): MethodDecorator {
  return applyDecorators(
    SetMetadata(REQUIRED_PERMISSIONS, permissions),
    ApiSecurity('sessionCookie'),
  );
}
