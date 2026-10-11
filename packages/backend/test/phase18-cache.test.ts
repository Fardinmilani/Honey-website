import { expect, it } from 'vitest';
import { RedisContentCache } from '../src/modules/content/infrastructure/redis-content-cache.js';
it('handles failed cache startup before first use while invalidation remains retryable', async () => {
  const cache = new RedisContentCache('redis://127.0.0.1:1', 'honey:phase18:unavailable');
  try {
    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect(await cache.get('unavailable')).toBeNull();
    await expect(
      cache.set('unavailable', '018f0000-0000-7000-8000-000000001801'),
    ).resolves.toBeUndefined();
    await expect(cache.invalidate()).rejects.toThrow();
  } finally {
    await cache.close();
  }
});
