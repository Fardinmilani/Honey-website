import { AppError, type AppErrorOptions, type ValidationIssue } from './app-error.js';

type FoundationOptions = Omit<AppErrorOptions, 'category' | 'code' | 'statusIntent'> &
  Readonly<{ code?: string }>;

export class ValidationAppError extends AppError {
  constructor(errors: readonly ValidationIssue[], options: FoundationOptions = {}) {
    super({
      ...options,
      code: options.code ?? 'VALIDATION_FAILED',
      category: 'validation',
      statusIntent: 'unprocessable-entity',
      errors,
    });
  }
}

export class NotFoundAppError extends AppError {
  constructor(options: FoundationOptions = {}) {
    super({
      ...options,
      code: options.code ?? 'NOT_FOUND',
      category: 'not-found',
      statusIntent: 'not-found',
    });
  }
}

export class ConflictAppError extends AppError {
  constructor(options: FoundationOptions = {}) {
    super({
      ...options,
      code: options.code ?? 'CONFLICT',
      category: 'conflict',
      statusIntent: 'conflict',
    });
  }
}

export class UnauthenticatedAppError extends AppError {
  constructor(options: FoundationOptions = {}) {
    super({
      ...options,
      code: options.code ?? 'UNAUTHENTICATED',
      category: 'unauthenticated',
      statusIntent: 'unauthorized',
    });
  }
}

export class ForbiddenAppError extends AppError {
  constructor(options: FoundationOptions = {}) {
    super({
      ...options,
      code: options.code ?? 'FORBIDDEN',
      category: 'forbidden',
      statusIntent: 'forbidden',
    });
  }
}

export class RateLimitedAppError extends AppError {
  constructor(options: FoundationOptions = {}) {
    super({
      retryable: true,
      ...options,
      code: options.code ?? 'RATE_LIMITED',
      category: 'rate-limited',
      statusIntent: 'too-many-requests',
    });
  }
}

export class DependencyUnavailableAppError extends AppError {
  constructor(options: FoundationOptions = {}) {
    super({
      retryable: true,
      ...options,
      code: options.code ?? 'DEPENDENCY_UNAVAILABLE',
      category: 'dependency-unavailable',
      statusIntent: 'service-unavailable',
    });
  }
}

export class InternalAppError extends AppError {
  constructor(options: FoundationOptions = {}) {
    super({
      ...options,
      code: options.code ?? 'INTERNAL_ERROR',
      category: 'internal',
      statusIntent: 'internal-error',
    });
  }
}
