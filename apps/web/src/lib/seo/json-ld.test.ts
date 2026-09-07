import { describe, expect, it } from 'vitest';

import { safeJsonLdStringify } from './json-ld';

describe('safeJsonLdStringify', () => {
  it('escapes less-than signs to prevent script breakout', () => {
    const payload = { name: '</script><script>alert(1)</script>' };
    const serialized = safeJsonLdStringify(payload);

    expect(serialized).not.toContain('</script>');
    expect(serialized).toContain('\\u003c');
  });

  it('round-trips JSON after unescaping angle brackets', () => {
    const value = { nested: { text: '<tag>' } };
    const serialized = safeJsonLdStringify(value);
    const restored = JSON.parse(serialized.replace(/\\u003c/gu, '<')) as typeof value;

    expect(restored).toEqual(value);
  });
});
