export interface paths {
  '/healthz': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Check process liveness
     * @description Reports whether the HTTP process is alive without querying dependencies.
     */
    get: operations['getHealth'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/readyz': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Check required dependencies
     * @description Reports readiness after a bounded PostgreSQL dependency check.
     */
    get: operations['getReadiness'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/auth/email-verification/confirm': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Confirm email verification
     * @description Consumes one valid, unexpired verification token and atomically marks the email verified.
     */
    post: operations['confirmEmailVerification'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/auth/email-verification/request': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Request email verification
     * @description Returns the same accepted response regardless of whether an eligible account exists.
     */
    post: operations['requestEmailVerification'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/auth/login': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Authenticate with email and password
     * @description Creates a customer session or a short-lived staff TOTP challenge after generic credential validation.
     */
    post: operations['login'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/auth/logout': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Revoke the current session
     * @description Revokes the server-side session before clearing the matching authentication cookies.
     */
    post: operations['logout'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/auth/logout-all': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Revoke every active session
     * @description Immediately revokes every active session owned by the authenticated account.
     */
    post: operations['logoutAll'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/auth/password-reset/confirm': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Confirm a password reset
     * @description Consumes one reset token, replaces the Argon2id credential, and revokes existing sessions.
     */
    post: operations['confirmPasswordReset'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/auth/password-reset/request': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Request a password reset
     * @description Rate-limits the request and returns an enumeration-safe accepted response.
     */
    post: operations['requestPasswordReset'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/auth/register': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Register a customer account
     * @description Creates only a CUSTOMER account and sends a one-time verification email when accepted.
     */
    post: operations['registerCustomer'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/auth/staff/totp/confirm': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    /**
     * Complete staff TOTP authentication
     * @description Consumes the pre-authentication cookie and creates a staff session only after valid TOTP verification.
     */
    post: operations['confirmStaffTotp'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/me': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * Get the authenticated account
     * @description Returns only the safe account and effective authorization summary for the current principal.
     */
    get: operations['getMe'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/me/sessions': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    /**
     * List active sessions for this account
     * @description Lists only active sessions owned by the authenticated account.
     */
    get: operations['listMySessions'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/v1/me/sessions/{sessionId}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post?: never;
    /**
     * Revoke one of this account’s sessions
     * @description Revokes an owned session and returns not found for a session owned by another account.
     */
    delete: operations['revokeMySession'];
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
}
export type webhooks = Record<string, never>;
export interface components {
  schemas: {
    AcceptedResponseDto: {
      /** @example true */
      accepted: boolean;
    };
    AuthenticatedResponseDto: {
      /** @description Double-submit value for X-CSRF-Token. */
      csrfToken: string;
      /** Format: date-time */
      expiresAt: string;
      /** @enum {string} */
      next: 'AUTHENTICATED';
      user: components['schemas']['SafeUserDto'];
    };
    HealthResponseDto: {
      /**
       * @example ok
       * @enum {string}
       */
      status: 'ok';
    };
    LoginResponseDto: {
      csrfToken?: string;
      /** Format: date-time */
      expiresAt?: string;
      /** @enum {string} */
      next: 'AUTHENTICATED' | 'TOTP_REQUIRED' | 'TOTP_ENROLLMENT_REQUIRED';
      /** @description Controlled TOTP enrollment URI; returned only after a valid staff password. */
      provisioningUri?: string;
      user?: components['schemas']['SafeUserDto'];
    };
    ProblemDetailsDto: {
      /** @example VALIDATION_FAILED */
      code: string;
      /** @example The request could not be processed. */
      detail?: string;
      errors?: components['schemas']['ValidationIssueDto'][];
      /** @example /v1/example */
      instance: string;
      /** @example 018f5d36-7b89-7a67-bb7a-e8f9f5db7412 */
      requestId: string;
      /** @example 422 */
      status: number;
      /** @example Request validation failed */
      title: string;
      /** @example https://api.honey.invalid/problems/validation-failed */
      type: string;
    };
    ReadyResponseDto: {
      checks?: {
        /**
         * @example ready
         * @enum {string}
         */
        database: 'ready';
      };
      /**
       * @example ready
       * @enum {string}
       */
      status: 'ready';
    };
    SafeUserDto: {
      displayName: string | null;
      /** Format: email */
      email: string;
      emailVerified: boolean;
      /** Format: uuid */
      id: string;
      isStaff: boolean;
      permissions: (
        | 'catalog:read'
        | 'catalog:write'
        | 'catalog:publish'
        | 'inventory:read'
        | 'inventory:adjust'
        | 'procurement:read'
        | 'procurement:write'
        | 'order:read'
        | 'order:write'
        | 'order:refund'
        | 'order:cancel'
        | 'customer:read'
        | 'customer:export'
        | 'content:read'
        | 'content:write'
        | 'content:publish'
        | 'review:moderate'
        | 'settings:read'
        | 'settings:write'
        | 'role:grant'
        | 'audit:read'
      )[];
      /** @example fa */
      preferredLocale: string;
      roles: (
        | 'OWNER'
        | 'ADMIN'
        | 'ORDER_MANAGER'
        | 'INVENTORY_MANAGER'
        | 'CONTENT_EDITOR'
        | 'SUPPORT'
        | 'CUSTOMER'
      )[];
      /** @enum {string} */
      status: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
    };
    SessionDto: {
      /** Format: date-time */
      createdAt: string;
      current: boolean;
      /** Format: date-time */
      expiresAt: string;
      /** Format: uuid */
      id: string;
      ip: string | null;
      /** @enum {string} */
      kind: 'CUSTOMER' | 'STAFF';
      /** Format: date-time */
      lastSeenAt: string;
      userAgentHash: string | null;
    };
    SessionsResponseDto: {
      sessions: components['schemas']['SessionDto'][];
    };
    ValidationIssueDto: {
      /** @example INVALID_VALUE */
      code: string;
      /** @example field */
      path: string;
    };
  };
  responses: never;
  parameters: never;
  requestBodies: never;
  headers: never;
  pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
  getHealth: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description The HTTP process is alive. */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['HealthResponseDto'];
        };
      };
      /** @description An unexpected failure occurred. */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
    };
  };
  getReadiness: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description All required dependencies are ready. */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ReadyResponseDto'];
        };
      };
      /** @description An unexpected failure occurred. */
      500: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
      /** @description A required dependency is unavailable. */
      503: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
    };
  };
  confirmEmailVerification: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
    };
  };
  requestEmailVerification: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      202: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AcceptedResponseDto'];
        };
      };
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
      429: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
    };
  };
  login: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['LoginResponseDto'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
      429: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
    };
  };
  logout: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
    };
  };
  logoutAll: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
    };
  };
  confirmPasswordReset: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      409: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
    };
  };
  requestPasswordReset: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      202: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AcceptedResponseDto'];
        };
      };
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
      429: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
    };
  };
  registerCustomer: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description Registration was accepted. */
      202: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AcceptedResponseDto'];
        };
      };
      422: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
      429: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
    };
  };
  confirmStaffTotp: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['AuthenticatedResponseDto'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
      429: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
    };
  };
  getMe: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SafeUserDto'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
    };
  };
  listMySessions: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['SessionsResponseDto'];
        };
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
    };
  };
  revokeMySession: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        sessionId: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      204: {
        headers: {
          [name: string]: unknown;
        };
        content?: never;
      };
      401: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
      403: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
      404: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'application/json': components['schemas']['ProblemDetailsDto'];
        };
      };
    };
  };
}
