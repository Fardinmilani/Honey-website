import { describe, expect, it } from 'vitest';

import {
  AppError,
  ConflictAppError,
  DependencyUnavailableAppError,
  ForbiddenAppError,
  InternalAppError,
  NotFoundAppError,
  RateLimitedAppError,
  UnauthenticatedAppError,
  ValidationAppError,
} from '../src/index.js';

describe('AppError', () => {
  it('serializes only safe public data', () => {
    const cause = new Error('database details');
    const error = new AppError({
      code: 'SAFE_FAILURE',
      category: 'conflict',
      statusIntent: 'conflict',
      safeDetail: 'A safe detail.',
      publicMetadata: { retry: false },
      internalMetadata: { query: 'SELECT secret' },
      cause,
    });

    expect(error.cause).toBe(cause);
    expect(error.toPublic()).toEqual({
      code: 'SAFE_FAILURE',
      category: 'conflict',
      statusIntent: 'conflict',
      retryable: false,
      safeDetail: 'A safe detail.',
      metadata: { retry: false },
    });
    expect(JSON.stringify(error.toPublic())).not.toContain('SELECT secret');
    expect(JSON.stringify(error.toPublic())).not.toContain('database details');
  });

  it('exposes the complete foundation taxonomy without transport imports', () => {
    const errors = [
      new ValidationAppError([{ path: 'name', code: 'IS_STRING' }]),
      new NotFoundAppError(),
      new ConflictAppError(),
      new UnauthenticatedAppError(),
      new ForbiddenAppError(),
      new RateLimitedAppError({ retryAfterSeconds: 2 }),
      new DependencyUnavailableAppError(),
      new InternalAppError(),
    ];
    expect(errors.map((error) => error.category)).toEqual([
      'validation',
      'not-found',
      'conflict',
      'unauthenticated',
      'forbidden',
      'rate-limited',
      'dependency-unavailable',
      'internal',
    ]);
  });

  it('rejects unstable machine codes', () => {
    expect(() => new ConflictAppError({ code: 'not-stable' })).toThrow(TypeError);
  });
});
