import { describe, expect, it } from 'vitest';

import { buildSecurityHeaders, shouldEmitHsts } from './security-headers';

describe('shouldEmitHsts', () => {
  it('is false for local HTTP / non-TLS public site URLs', () => {
    expect(
      shouldEmitHsts({
        NODE_ENV: 'production',
        NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3000',
      }),
    ).toBe(false);
    expect(
      shouldEmitHsts({
        NODE_ENV: 'production',
        PUBLIC_SITE_URL: 'http://localhost:3000',
      }),
    ).toBe(false);
    expect(
      shouldEmitHsts({
        NODE_ENV: 'development',
        NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
      }),
    ).toBe(false);
  });

  it('is false when NODE_ENV is production but no HTTPS site URL is configured', () => {
    expect(shouldEmitHsts({ NODE_ENV: 'production' })).toBe(false);
  });

  it('is true for trusted production HTTPS public site origins', () => {
    expect(
      shouldEmitHsts({
        NODE_ENV: 'production',
        NEXT_PUBLIC_SITE_URL: 'https://shop.example.com',
      }),
    ).toBe(true);
    expect(
      shouldEmitHsts({
        NODE_ENV: 'development',
        PUBLIC_SITE_URL: 'https://shop.example.com',
      }),
    ).toBe(true);
  });

  it('is false for malformed site URLs', () => {
    expect(
      shouldEmitHsts({
        NEXT_PUBLIC_SITE_URL: 'not-a-url',
      }),
    ).toBe(false);
  });
});

describe('buildSecurityHeaders', () => {
  it('always includes baseline headers and never weakens CSP', () => {
    const headers = buildSecurityHeaders({
      NODE_ENV: 'production',
      NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3000',
    });
    const byKey = Object.fromEntries(headers.map((header) => [header.key, header.value]));
    expect(byKey['X-Content-Type-Options']).toBe('nosniff');
    expect(byKey['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(byKey['X-Frame-Options']).toBe('DENY');
    expect(byKey['Permissions-Policy']).toContain('camera=()');
    expect(byKey['Content-Security-Policy']).toContain("default-src 'self'");
    expect(byKey['Content-Security-Policy']).not.toContain('script-src *');
    expect(byKey['Content-Security-Policy']).not.toContain('default-src *');
    expect(byKey['Strict-Transport-Security']).toBeUndefined();
  });

  it('omits HSTS for local HTTP / non-TLS runtime', () => {
    const headers = buildSecurityHeaders({
      NODE_ENV: 'production',
      NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3000',
      PUBLIC_SITE_URL: 'http://127.0.0.1:3000',
    });
    expect(headers.some((header) => header.key === 'Strict-Transport-Security')).toBe(false);
  });

  it('includes HSTS for trusted HTTPS public site configuration', () => {
    const headers = buildSecurityHeaders({
      NODE_ENV: 'production',
      NEXT_PUBLIC_SITE_URL: 'https://honey.example.com',
    });
    const hsts = headers.find((header) => header.key === 'Strict-Transport-Security');
    expect(hsts?.value).toBe('max-age=31536000; includeSubDomains');
  });
});
