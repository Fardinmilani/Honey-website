import { Writable } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { createApiLogger } from '../src/http/logging/api-logger.js';
import { verifyCsrf } from '../src/http/security/csrf.js';
import { InMemoryRateLimitStore } from '../src/http/security/rate-limit.js';
import { loadApiConfig } from '../src/config/api-config.js';

describe('transport security primitives', () => {
  it('excludes safe and exempt methods from CSRF checks', () => {
    expect(() =>
      verifyCsrf({ method: 'GET', cookieToken: undefined, headerToken: undefined }),
    ).not.toThrow();
    expect(() =>
      verifyCsrf({ method: 'POST', cookieToken: undefined, headerToken: undefined, exempt: true }),
    ).not.toThrow();
  });

  it('accepts matching tokens and rejects missing or mismatched tokens', () => {
    const token = 'a'.repeat(32);
    expect(() =>
      verifyCsrf({ method: 'POST', cookieToken: token, headerToken: token }),
    ).not.toThrow();
    expect(() =>
      verifyCsrf({ method: 'POST', cookieToken: undefined, headerToken: token }),
    ).toThrow();
    expect(() =>
      verifyCsrf({ method: 'POST', cookieToken: token, headerToken: 'b'.repeat(32) }),
    ).toThrow();
  });

  it('provides a replaceable baseline rate-limit store', async () => {
    const store = new InMemoryRateLimitStore(1, 60_000);
    await expect(store.consume('client', 1)).resolves.toMatchObject({
      allowed: true,
      remaining: 0,
    });
    await expect(store.consume('client', 2)).resolves.toMatchObject({
      allowed: false,
      remaining: 0,
    });
  });

  it('redacts sensitive structured fields', () => {
    let output = '';
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        output += chunk.toString();
        callback();
      },
    });
    const config = loadApiConfig({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://api:api@127.0.0.1:5432/api',
    });
    const logger = createApiLogger(config, destination);
    logger.info(
      { authorization: 'Bearer private', cookie: 'session=private', password: 'private' },
      'probe',
    );
    logger.flush();
    expect(output).toContain('[Redacted]');
    expect(output).not.toContain('Bearer private');
    expect(output).not.toContain('session=private');
  });
});
