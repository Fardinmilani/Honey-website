import { describe, expect, it } from 'vitest';

import {
  JOB_NAMES,
  InvalidJobPayloadError,
  createJobEnvelope,
  decodeJobEnvelope,
  deterministicJobId,
} from '@honey/backend';

import { classifyFailure } from './failure-policy.js';

const OLD_RELEASE_V1_FIXTURE = Object.freeze({
  version: 1,
  type: 'inventory.reservation-sweep.v1',
  correlationId: 'phase15-reservation-compatibility',
  occurredAt: '2026-09-30T12:00:00.000Z',
  payload: {},
});

describe('shared versioned job contract', () => {
  it('reads the synthetic previous-release V1 payload without changing its meaning', () => {
    expect(decodeJobEnvelope(OLD_RELEASE_V1_FIXTURE, JOB_NAMES.reservationSweep)).toEqual(
      OLD_RELEASE_V1_FIXTURE,
    );
  });

  it('rejects unknown versions, mismatched names, and extra fields before a service call', () => {
    const valid = createJobEnvelope(JOB_NAMES.sitemapRegenerate, { locale: 'fa' }, 'test-1');
    expect(() => decodeJobEnvelope({ ...valid, version: 2 })).toThrowError(InvalidJobPayloadError);
    expect(() => decodeJobEnvelope(valid, JOB_NAMES.backupVerify)).toThrowError(
      InvalidJobPayloadError,
    );
    expect(() => decodeJobEnvelope({ ...valid, secret: 'never-store-this' })).toThrowError(
      InvalidJobPayloadError,
    );
    expect(() =>
      decodeJobEnvelope({ ...valid, payload: { locale: 'fa', url: 'https://untrusted.example' } }),
    ).toThrowError(InvalidJobPayloadError);
  });

  it('rejects PII, class instances, and malformed backup jobs', () => {
    const base = createJobEnvelope(JOB_NAMES.backupVerify, {}, 'test-2');
    expect(() =>
      decodeJobEnvelope({ ...base, payload: { email: 'person@example.test' } }),
    ).toThrowError(InvalidJobPayloadError);
    expect(() => decodeJobEnvelope({ ...base, payload: new Date() })).toThrowError(
      InvalidJobPayloadError,
    );
    expect(() =>
      decodeJobEnvelope({ ...base, occurredAt: '2026-02-31T00:00:00.000Z' }),
    ).toThrowError(InvalidJobPayloadError);
    expect(() =>
      createJobEnvelope(JOB_NAMES.inventoryReconcile, { repair: true }, 'test-3'),
    ).toThrowError(InvalidJobPayloadError);
  });

  it('accepts a bounded inventory continuation cursor and rejects extra or malformed fields', () => {
    const cursor = {
      variantId: '6f22b221-e810-4987-becf-e1a9db889111',
      stockLocationId: '9f22b221-e810-4987-becf-e1a9db889222',
    };
    const oldScheduled = createJobEnvelope(
      JOB_NAMES.inventoryReconcile,
      { repair: false },
      'old-v1',
    );
    expect(decodeJobEnvelope(oldScheduled, JOB_NAMES.inventoryReconcile)).toEqual(oldScheduled);
    const continuation = createJobEnvelope(
      JOB_NAMES.inventoryReconcile,
      { repair: false, cursor },
      'continuation-v1',
    );
    expect(decodeJobEnvelope(continuation, JOB_NAMES.inventoryReconcile)).toEqual(continuation);
    expect(() =>
      decodeJobEnvelope({
        ...continuation,
        payload: { repair: false, cursor: { ...cursor, email: 'a@example.test' } },
      }),
    ).toThrowError(InvalidJobPayloadError);
    expect(() =>
      decodeJobEnvelope({
        ...continuation,
        payload: { repair: false, cursor: { ...cursor, variantId: 'bad' } },
      }),
    ).toThrowError(InvalidJobPayloadError);
  });

  it('creates stable non-PII IDs and permanent malformed-payload classification', () => {
    const first = deterministicJobId({
      type: JOB_NAMES.catalogRevalidate,
      key: '6f22b221-e810-4987-becf-e1a9db889111',
    });
    const second = deterministicJobId({
      type: JOB_NAMES.catalogRevalidate,
      key: '6f22b221-e810-4987-becf-e1a9db889111',
    });
    expect(first).toBe(second);
    expect(first).not.toContain(':');
    expect(() =>
      deterministicJobId({ type: JOB_NAMES.catalogRevalidate, key: 'person@example.test' }),
    ).toThrowError(InvalidJobPayloadError);
    expect(classifyFailure(new InvalidJobPayloadError('MALFORMED_JOB'))).toEqual({
      code: 'MALFORMED_JOB',
      retryable: false,
    });
  });
});
