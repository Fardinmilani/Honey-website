import { describe, expect, it } from 'vitest';

import { loadWorkerConfig } from './config.js';
import { classifyFailure, RETRY_POLICY, safeFailureCode } from './failure-policy.js';

const valid = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://example:placeholder@127.0.0.1:5432/honey',
  REDIS_URL: 'redis://127.0.0.1:6379',
  WORKER_WEB_ORIGIN: 'http://127.0.0.1:3000',
  WEB_REVALIDATE_SECRET: 'safe-development-placeholder',
  IDENTITY_SMTP_HOST: '127.0.0.1',
  IDENTITY_SMTP_PORT: '1025',
  IDENTITY_SMTP_SECURE: 'false',
  IDENTITY_EMAIL_FROM: 'worker@example.test',
  PAYMENT_PROVIDER: 'mock',
  BACKUP_VERIFICATION_ENABLED: 'false',
};

describe('worker configuration and retry policy', () => {
  it('keeps backup verification explicitly disabled and rejects activation without an adapter', () => {
    expect(loadWorkerConfig(valid).environment).toBe('development');
    expect(() => loadWorkerConfig({ ...valid, BACKUP_VERIFICATION_ENABLED: 'true' })).toThrow(
      'Phase 20 concrete verifier adapter',
    );
  });

  it('requires HTTPS in production and a server-side revalidation secret', () => {
    expect(() =>
      loadWorkerConfig({ ...valid, NODE_ENV: 'production', PAYMENT_PROVIDER: 'zarinpal' }),
    ).toThrow('WORKER_WEB_ORIGIN');
    expect(() => loadWorkerConfig({ ...valid, WEB_REVALIDATE_SECRET: '' })).toThrow(
      'WEB_REVALIDATE_SECRET',
    );
    expect(() =>
      loadWorkerConfig({ ...valid, WORKER_WEB_ORIGIN: 'http://127.0.0.1:3000/path' }),
    ).toThrow('WORKER_WEB_ORIGIN');
  });

  it('uses bounded exponential backoff with jitter and redacts unknown error codes', () => {
    expect(RETRY_POLICY.attempts).toBe(4);
    expect(RETRY_POLICY.backoff).toEqual({ type: 'exponential', delay: 1_000, jitter: 0.25 });
    expect(safeFailureCode('TOKENSHAPEDSECRET')).toBe('TERMINAL_JOB_FAILURE');
    expect(classifyFailure(new Error('WEB_REVALIDATION_AUTH_REJECTED'))).toEqual({
      code: 'WEB_REVALIDATION_AUTH_REJECTED',
      retryable: false,
    });
    expect(classifyFailure(new Error('WEB_REVALIDATION_UNAVAILABLE'))).toEqual({
      code: 'WEB_REVALIDATION_UNAVAILABLE',
      retryable: true,
    });
  });
});
