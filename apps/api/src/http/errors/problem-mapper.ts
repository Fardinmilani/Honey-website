import {
  AppError,
  type PublicAppError,
  type StatusIntent,
  ValidationAppError,
  type ValidationIssue,
} from '@honey/backend';
import { HttpException } from '@nestjs/common';

const STATUS_BY_INTENT: Readonly<Record<StatusIntent, number>> = {
  'bad-request': 400,
  'unprocessable-entity': 422,
  unauthorized: 401,
  forbidden: 403,
  'not-found': 404,
  conflict: 409,
  'too-many-requests': 429,
  'internal-error': 500,
  'service-unavailable': 503,
};

const TITLES: Readonly<Record<string, string>> = {
  VALIDATION_FAILED: 'Request validation failed',
  MALFORMED_JSON: 'Malformed JSON request',
  NOT_FOUND: 'Resource not found',
  UNAUTHENTICATED: 'Authentication required',
  FORBIDDEN: 'Request forbidden',
  RATE_LIMITED: 'Request rate limited',
  DEPENDENCY_UNAVAILABLE: 'Required dependency unavailable',
  INTERNAL_ERROR: 'Internal server error',
};

export type ProblemDetails = Readonly<{
  type: string;
  title: string;
  status: number;
  code: string;
  instance: string;
  requestId: string;
  detail?: string;
  errors?: readonly ValidationIssue[];
}>;

function slug(code: string): string {
  return code.toLowerCase().replaceAll('_', '-');
}

function fromPublic(error: PublicAppError, instance: string, requestId: string): ProblemDetails {
  const result: {
    type: string;
    title: string;
    status: number;
    code: string;
    instance: string;
    requestId: string;
    detail?: string;
    errors?: readonly ValidationIssue[];
  } = {
    type: `https://api.honey.invalid/problems/${slug(error.code)}`,
    title: TITLES[error.code] ?? 'Request failed',
    status: STATUS_BY_INTENT[error.statusIntent],
    code: error.code,
    instance,
    requestId,
  };
  if (error.safeDetail !== undefined) result.detail = error.safeDetail;
  if (error.errors !== undefined) result.errors = error.errors;
  return result;
}

export function toProblem(error: unknown, instance: string, requestId: string): ProblemDetails {
  if (error instanceof AppError) return fromPublic(error.toPublic(), instance, requestId);
  if (error instanceof HttpException && error.getStatus() === 400) {
    return fromPublic(
      new AppError({
        code: 'MALFORMED_JSON',
        category: 'validation',
        statusIntent: 'bad-request',
      }).toPublic(),
      instance,
      requestId,
    );
  }
  if (error instanceof HttpException && error.getStatus() === 404) {
    return fromPublic(
      new AppError({
        code: 'NOT_FOUND',
        category: 'not-found',
        statusIntent: 'not-found',
      }).toPublic(),
      instance,
      requestId,
    );
  }
  return fromPublic(
    new AppError({
      code: 'INTERNAL_ERROR',
      category: 'internal',
      statusIntent: 'internal-error',
    }).toPublic(),
    instance,
    requestId,
  );
}

export function validationError(issues: readonly ValidationIssue[]): ValidationAppError {
  return new ValidationAppError(issues);
}
