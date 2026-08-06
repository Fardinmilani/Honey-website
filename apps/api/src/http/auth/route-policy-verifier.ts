import type { Type } from '@nestjs/common';

import { PUBLIC_ROUTE, REQUIRED_PERMISSIONS } from './authorization.js';

const METHOD_METADATA = 'method';

export type ControllerClass = Type<unknown>;

export function assertControllerAuthorizationPolicies(
  controllers: readonly ControllerClass[],
): void {
  const violations: string[] = [];
  for (const controller of controllers) {
    for (const name of Object.getOwnPropertyNames(controller.prototype)) {
      if (name === 'constructor') continue;
      const descriptor = Object.getOwnPropertyDescriptor(controller.prototype, name);
      const handler = descriptor?.value;
      if (typeof handler !== 'function') continue;
      const method: unknown = Reflect.getMetadata(METHOD_METADATA, handler);
      if (method === undefined) continue;
      const isPublic: unknown = Reflect.getMetadata(PUBLIC_ROUTE, handler);
      const permissions: unknown = Reflect.getMetadata(REQUIRED_PERMISSIONS, handler);
      const policyCount = Number(isPublic === true) + Number(Array.isArray(permissions));
      if (policyCount !== 1) violations.push(`${controller.name}.${name}`);
    }
  }
  if (violations.length > 0) {
    throw new Error(
      `Routes require exactly one authorization declaration: ${violations.join(', ')}.`,
    );
  }
}
