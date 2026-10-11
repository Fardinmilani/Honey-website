import { createClient, type RedisClientType } from 'redis';
import type { ContentResolutionCache } from '../domain/content-cache.js';
export class RedisContentCache implements ContentResolutionCache {
  readonly client: RedisClientType;
  readonly ready: Promise<void>;
  constructor(
    redisUrl: string,
    private readonly namespace = 'honey:catalog:v1',
  ) {
    if (!/^[a-zA-Z0-9:_-]{1,100}$/u.test(namespace))
      throw new Error('Invalid content cache namespace.');
    this.client = createClient({
      url: redisUrl,
      socket: { connectTimeout: 1000, reconnectStrategy: false },
    });
    this.client.on('error', () => undefined);
    this.ready = this.client.connect().then(() => undefined);
    // Connection failure may precede the first cache operation. Attach a
    // handler immediately; invalidate still awaits the original rejection.
    void this.ready.catch(() => undefined);
  }
  private key(key: string) {
    return `${this.namespace}:content:resolution:${key}`;
  }
  private tag() {
    return `${this.namespace}:content:keys`;
  }
  async get(key: string) {
    try {
      await this.ready;
      const id = await this.client.get(this.key(key));
      return id !== null && /^[0-9a-f-]{36}$/iu.test(id) ? id : null;
    } catch {
      return null;
    }
  }
  async set(key: string, id: string) {
    try {
      await this.ready;
      await this.client
        .multi()
        .set(this.key(key), id, { EX: 60 })
        .sAdd(this.tag(), this.key(key))
        .expire(this.tag(), 120)
        .exec();
    } catch {
      /* Fail open to the authoritative database. */
    }
  }
  async invalidate() {
    await this.ready;
    const keys = await this.client.sMembers(this.tag());
    if (keys.length > 0) await this.client.del(keys);
    await this.client.del(this.tag());
  }
  async close() {
    try {
      await this.ready;
      if (this.client.isOpen) await this.client.quit();
    } catch {
      if (this.client.isOpen) this.client.destroy();
    }
  }
}
