import { ValidationPipe, type ValidationError } from '@nestjs/common';

import type { ValidationIssue } from '@honey/backend';
import { validationError } from '../errors/problem-mapper.js';

function flatten(errors: readonly ValidationError[], parent = ''): readonly ValidationIssue[] {
  return errors.flatMap((error) => {
    const path = parent.length === 0 ? error.property : `${parent}.${error.property}`;
    const current = Object.keys(error.constraints ?? {}).map((code) => ({
      path,
      code: code.toUpperCase(),
    }));
    return [...current, ...flatten(error.children ?? [], path)];
  });
}

export function createGlobalValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    transform: false,
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
    stopAtFirstError: false,
    exceptionFactory: (errors) => validationError(flatten(errors)),
  });
}
