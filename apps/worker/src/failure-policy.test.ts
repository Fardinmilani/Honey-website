import { describe, expect, it } from 'vitest';

import {
  InternalAppError,
  SmtpFulfilmentNotificationAdapter,
  type FulfilmentNotification,
} from '@honey/backend';

import { classifyFailure, safeFailureCode } from './failure-policy.js';

function codedError(code: string): Error & Readonly<{ code: string }> {
  return Object.assign(new Error('Safe test error.'), { code });
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Expected a rejection.');
}

describe('worker failure classification', () => {
  it('retries only known transient network, database, and SMTP failures', () => {
    expect(classifyFailure(codedError('ECONNRESET'))).toEqual({
      code: 'NETWORK_UNAVAILABLE',
      retryable: true,
    });
    for (const code of ['P1001', 'P1002', 'P1008', 'P1017', 'P2024', 'P2034']) {
      expect(classifyFailure(codedError(code))).toEqual({
        code: 'DATABASE_RETRYABLE',
        retryable: true,
      });
    }
    expect(classifyFailure(codedError('FULFILMENT_SMTP_UNAVAILABLE'))).toEqual({
      code: 'DEPENDENCY_UNAVAILABLE',
      retryable: true,
    });
    expect(
      classifyFailure(
        Object.assign(new TypeError('fetch failed'), { cause: codedError('ECONNREFUSED') }),
      ),
    ).toEqual({ code: 'NETWORK_UNAVAILABLE', retryable: true });
    expect(
      classifyFailure(Object.assign(new Error('Request timed out.'), { name: 'TimeoutError' })),
    ).toEqual({ code: 'NETWORK_UNAVAILABLE', retryable: true });
    expect(
      classifyFailure(
        Object.assign(new TypeError('fetch failed'), {
          cause: new AggregateError([codedError('ECONNREFUSED')]),
        }),
      ),
    ).toEqual({ code: 'NETWORK_UNAVAILABLE', retryable: true });
  });

  it('treats invalid recipients, configuration, and unknown invariants as terminal', () => {
    expect(classifyFailure(codedError('FULFILMENT_EMAIL_RECIPIENT_INVALID'))).toEqual({
      code: 'VALIDATION_REJECTED',
      retryable: false,
    });
    expect(classifyFailure(codedError('P1000'))).toEqual({
      code: 'UNCLASSIFIED_PERMANENT',
      retryable: false,
    });
    expect(classifyFailure(new InternalAppError())).toEqual({
      code: 'INVARIANT_VIOLATION',
      retryable: false,
    });
    expect(classifyFailure(new TypeError('Invalid invariant.'))).toEqual({
      code: 'INVARIANT_VIOLATION',
      retryable: false,
    });
    expect(classifyFailure(new Error('Unexpected failure.'))).toEqual({
      code: 'UNCLASSIFIED_PERMANENT',
      retryable: false,
    });
    expect(safeFailureCode('UNCLASSIFIED_PERMANENT')).toBe('UNCLASSIFIED_PERMANENT');
    expect(safeFailureCode('private-data')).toBe('TERMINAL_JOB_FAILURE');
  });

  it('classifies the real SMTP adapter invalid-recipient rejection without a DB query', async () => {
    const adapter = new SmtpFulfilmentNotificationAdapter(
      'postgresql://example:placeholder@127.0.0.1:5432/honey',
      {
        host: '127.0.0.1',
        port: 1025,
        secure: false,
        from: 'worker@example.test',
        connectionTimeoutMs: 1_000,
      },
    );
    const notification: FulfilmentNotification = {
      shipmentId: '6f22b221-e810-4987-becf-e1a9db889111',
      orderNumber: 'H-1001',
      email: 'invalid-address',
      locale: 'fa',
      trackingNumber: null,
      trackingUrl: null,
    };
    try {
      const error = await rejection(adapter.sendShipped(notification));
      expect(error).toMatchObject({ code: 'FULFILMENT_EMAIL_RECIPIENT_INVALID' });
      expect(classifyFailure(error)).toEqual({ code: 'VALIDATION_REJECTED', retryable: false });
    } finally {
      await adapter.close();
    }
  });
});
