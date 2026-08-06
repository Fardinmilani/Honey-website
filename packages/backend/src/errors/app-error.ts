export type JsonPrimitive = boolean | number | string | null;
export type JsonValue =
  JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export type ErrorCategory =
  | 'validation'
  | 'not-found'
  | 'conflict'
  | 'unauthenticated'
  | 'forbidden'
  | 'rate-limited'
  | 'dependency-unavailable'
  | 'internal';

export type StatusIntent =
  | 'bad-request'
  | 'unprocessable-entity'
  | 'unauthorized'
  | 'forbidden'
  | 'not-found'
  | 'conflict'
  | 'too-many-requests'
  | 'internal-error'
  | 'service-unavailable';

export type ValidationIssue = Readonly<{
  path: string;
  code: string;
  meta?: Readonly<Record<string, JsonValue>>;
}>;

export type AppErrorOptions = Readonly<{
  code: string;
  category: ErrorCategory;
  statusIntent: StatusIntent;
  safeDetail?: string;
  errors?: readonly ValidationIssue[];
  retryable?: boolean;
  retryAfterSeconds?: number;
  publicMetadata?: Readonly<Record<string, JsonValue>>;
  internalMetadata?: Readonly<Record<string, unknown>>;
  cause?: unknown;
}>;

export type PublicAppError = Readonly<{
  code: string;
  category: ErrorCategory;
  statusIntent: StatusIntent;
  retryable: boolean;
  safeDetail?: string;
  errors?: readonly ValidationIssue[];
  retryAfterSeconds?: number;
  metadata?: Readonly<Record<string, JsonValue>>;
}>;

const CODE_PATTERN = /^[A-Z][A-Z0-9_]{2,63}$/u;

export class AppError extends Error {
  readonly code: string;
  readonly category: ErrorCategory;
  readonly statusIntent: StatusIntent;
  readonly safeDetail: string | undefined;
  readonly errors: readonly ValidationIssue[] | undefined;
  readonly retryable: boolean;
  readonly retryAfterSeconds: number | undefined;
  readonly publicMetadata: Readonly<Record<string, JsonValue>> | undefined;
  readonly internalMetadata: Readonly<Record<string, unknown>> | undefined;

  constructor(options: AppErrorOptions) {
    super(options.code, options.cause === undefined ? undefined : { cause: options.cause });
    if (!CODE_PATTERN.test(options.code)) {
      throw new TypeError('AppError codes must be stable upper-snake-case identifiers.');
    }
    this.name = new.target.name;
    this.code = options.code;
    this.category = options.category;
    this.statusIntent = options.statusIntent;
    this.safeDetail = options.safeDetail;
    this.errors = options.errors;
    this.retryable = options.retryable ?? false;
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.publicMetadata = options.publicMetadata;
    this.internalMetadata = options.internalMetadata;
  }

  toPublic(): PublicAppError {
    const result: {
      code: string;
      category: ErrorCategory;
      statusIntent: StatusIntent;
      retryable: boolean;
      safeDetail?: string;
      errors?: readonly ValidationIssue[];
      retryAfterSeconds?: number;
      metadata?: Readonly<Record<string, JsonValue>>;
    } = {
      code: this.code,
      category: this.category,
      statusIntent: this.statusIntent,
      retryable: this.retryable,
    };
    if (this.safeDetail !== undefined) result.safeDetail = this.safeDetail;
    if (this.errors !== undefined) result.errors = this.errors;
    if (this.retryAfterSeconds !== undefined) result.retryAfterSeconds = this.retryAfterSeconds;
    if (this.publicMetadata !== undefined) result.metadata = this.publicMetadata;
    return result;
  }
}
