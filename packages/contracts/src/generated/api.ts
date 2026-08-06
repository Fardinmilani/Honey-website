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
}
export type webhooks = Record<string, never>;
export interface components {
  schemas: {
    HealthResponseDto: {
      /**
       * @example ok
       * @enum {string}
       */
      status: 'ok';
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
}
