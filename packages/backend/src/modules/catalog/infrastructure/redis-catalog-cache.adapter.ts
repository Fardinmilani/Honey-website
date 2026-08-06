import { createClient, type RedisClientType } from 'redis';

import type { CatalogCache } from '../domain/catalog-cache.port.js';

export class RedisCatalogCache implements CatalogCache {
  readonly #client: RedisClientType;
  readonly #ready: Promise<void>;

  constructor(
    redisUrl: string,
    private readonly namespace: string,
  ) {
    this.#client = createClient({
      url: redisUrl,
      socket: { connectTimeout: 1_000, reconnectStrategy: false },
    });
    this.#client.on('error', () => undefined);
    this.#ready = this.#client.connect().then(() => undefined);
  }

  async get(key: string): Promise<unknown | null> {
    try {
      await this.#ready;
      const value = await this.#client.get(this.#dataKey(key));
      return value === null ? null : JSON.parse(value);
    } catch {
      return null;
    }
  }

  async set(
    key: string,
    value: unknown,
    ttlSeconds: number,
    tags: readonly string[],
  ): Promise<void> {
    try {
      await this.#ready;
      const dataKey = this.#dataKey(key);
      const selectedTags = [...new Set(tags)].slice(0, 64);
      const transaction = this.#client
        .multi()
        .set(dataKey, JSON.stringify(value), { EX: ttlSeconds });
      for (const tag of selectedTags) {
        transaction.sAdd(this.#tagKey(tag), dataKey).expire(this.#tagKey(tag), ttlSeconds + 60);
      }
      await transaction.exec();
    } catch {
      // PostgreSQL remains authoritative. A failed cache write is deliberately non-fatal.
    }
  }

  async invalidateTags(tags: readonly string[]): Promise<void> {
    try {
      await this.#ready;
      const selected = [...new Set(tags)].slice(0, 64);
      const tagKeys = selected.map((tag) => this.#tagKey(tag));
      const members = await Promise.all(tagKeys.map((tagKey) => this.#client.sMembers(tagKey)));
      const dataKeys = [...new Set(members.flat())].slice(0, 2_000);
      if (dataKeys.length === 0 && tagKeys.length === 0) return;
      const transaction = this.#client.multi();
      if (dataKeys.length > 0) transaction.del(dataKeys);
      if (tagKeys.length > 0) transaction.del(tagKeys);
      await transaction.exec();
    } catch {
      // TTL bounds stale public reads when Redis is unavailable during invalidation.
    }
  }

  async close(): Promise<void> {
    try {
      await this.#ready;
      if (this.#client.isOpen) await this.#client.quit();
    } catch {
      if (this.#client.isOpen) this.#client.destroy();
    }
  }

  #dataKey(key: string): string {
    return `${this.namespace}:data:${key}`;
  }

  #tagKey(tag: string): string {
    return `${this.namespace}:tag:${tag}`;
  }
}
