import {
  DependencyUnavailableAppError,
  ForbiddenAppError,
  InternalAppError,
  InvalidJobPayloadError,
  NotFoundAppError,
  RateLimitedAppError,
  UnauthenticatedAppError,
  ValidationAppError,
  ConflictAppError,
} from '@honey/backend';

export type ClassifiedFailure = Readonly<{
  code: string;
  retryable: boolean;
}>;

const SAFE_FAILURE_CODES = new Set([
  'MALFORMED_JOB',
  'UNSUPPORTED_JOB_VERSION',
  'JOB_NAME_MISMATCH',
  'VALIDATION_REJECTED',
  'AUTHORIZATION_REJECTED',
  'RECORD_NOT_FOUND',
  'APPLICATION_CONFLICT',
  'DEPENDENCY_RATE_LIMITED',
  'DEPENDENCY_UNAVAILABLE',
  'NETWORK_UNAVAILABLE',
  'DATABASE_RETRYABLE',
  'BACKUP_CAPABILITY_DISABLED',
  'WEB_REVALIDATION_UNAVAILABLE',
  'WEB_REVALIDATION_AUTH_REJECTED',
  'WEB_REVALIDATION_REJECTED',
  'UNKNOWN_JOB_NAME',
  'JOB_QUEUE_MISMATCH',
  'INVARIANT_VIOLATION',
  'UNCLASSIFIED_PERMANENT',
]);

export function safeFailureCode(value: string): string {
  return SAFE_FAILURE_CODES.has(value) ? value : 'TERMINAL_JOB_FAILURE';
}

const NETWORK_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'ENOTFOUND',
  'EPIPE',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_SOCKET',
]);

const DATABASE_RETRYABLE_CODES = new Set([
  'P1001', // Database server cannot be reached.
  'P1002', // Database server connection timed out.
  'P1008', // An operation timed out.
  'P1017', // Server closed the connection.
  'P2024', // Connection pool timed out.
  'P2034', // Transaction conflict or deadlock.
]);

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}

function errorCause(error: unknown): unknown {
  if (typeof error !== 'object' || error === null || !('cause' in error)) return undefined;
  return error.cause;
}

function knownNetworkFailure(error: unknown, depth = 0): boolean {
  if (depth > 2) return false;
  const code = errorCode(error);
  if (code !== undefined && NETWORK_CODES.has(code)) return true;
  if (error instanceof Error && error.name === 'TimeoutError') return true;
  const cause = errorCause(error);
  if (cause !== undefined && knownNetworkFailure(cause, depth + 1)) return true;
  if (typeof error === 'object' && error !== null && 'errors' in error) {
    const nested: unknown = error.errors;
    if (Array.isArray(nested)) {
      const firstFour: readonly unknown[] = nested.slice(0, 4);
      return firstFour.some((item) => knownNetworkFailure(item, depth + 1));
    }
  }
  return false;
}

/** One safe classification layer; raw provider/DB errors never enter Redis/logs. */
export function classifyFailure(error: unknown): ClassifiedFailure {
  if (error instanceof InvalidJobPayloadError) return { code: error.code, retryable: false };
  if (error instanceof ValidationAppError) return { code: 'VALIDATION_REJECTED', retryable: false };
  if (error instanceof InternalAppError) {
    return { code: 'INVARIANT_VIOLATION', retryable: false };
  }
  if (error instanceof ForbiddenAppError || error instanceof UnauthenticatedAppError) {
    return { code: 'AUTHORIZATION_REJECTED', retryable: false };
  }
  if (error instanceof NotFoundAppError) return { code: 'RECORD_NOT_FOUND', retryable: false };
  if (error instanceof ConflictAppError) return { code: 'APPLICATION_CONFLICT', retryable: false };
  if (error instanceof RateLimitedAppError)
    return { code: 'DEPENDENCY_RATE_LIMITED', retryable: true };
  if (error instanceof DependencyUnavailableAppError) {
    return { code: 'DEPENDENCY_UNAVAILABLE', retryable: true };
  }
  const code = errorCode(error);
  if (code === 'FULFILMENT_EMAIL_RECIPIENT_INVALID') {
    return { code: 'VALIDATION_REJECTED', retryable: false };
  }
  if (code === 'FULFILMENT_SMTP_UNAVAILABLE') {
    return { code: 'DEPENDENCY_UNAVAILABLE', retryable: true };
  }
  if (knownNetworkFailure(error)) {
    return { code: 'NETWORK_UNAVAILABLE', retryable: true };
  }
  if (code !== undefined && DATABASE_RETRYABLE_CODES.has(code)) {
    return { code: 'DATABASE_RETRYABLE', retryable: true };
  }
  if (error instanceof TypeError || error instanceof RangeError) {
    return { code: 'INVARIANT_VIOLATION', retryable: false };
  }
  if (error instanceof Error && error.message === 'BACKUP_CAPABILITY_DISABLED') {
    return { code: 'BACKUP_CAPABILITY_DISABLED', retryable: false };
  }
  if (
    error instanceof Error &&
    (error.message === 'UNKNOWN_JOB_NAME' || error.message === 'JOB_QUEUE_MISMATCH')
  ) {
    return { code: error.message, retryable: false };
  }
  if (error instanceof Error && error.message === 'WEB_REVALIDATION_UNAVAILABLE') {
    return { code: 'WEB_REVALIDATION_UNAVAILABLE', retryable: true };
  }
  if (
    error instanceof Error &&
    (error.message === 'WEB_REVALIDATION_AUTH_REJECTED' ||
      error.message === 'WEB_REVALIDATION_REJECTED')
  ) {
    return { code: error.message, retryable: false };
  }
  return { code: 'UNCLASSIFIED_PERMANENT', retryable: false };
}

export const RETRY_POLICY = {
  attempts: 4,
  backoff: { type: 'exponential', delay: 1_000, jitter: 0.25 },
  removeOnComplete: { age: 7 * 86_400, count: 10_000 },
  removeOnFail: { age: 30 * 86_400, count: 10_000 },
} as const;
