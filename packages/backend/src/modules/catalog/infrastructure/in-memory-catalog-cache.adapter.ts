import type { CatalogCache } from '../domain/catalog-cache.port.js';

type Entry = Readonly<{ value: unknown; expiresAt: number; tags: readonly string[] }>;

export class InMemoryCatalogCache implements CatalogCache {
  readonly #entries = new Map<string, Entry>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  async get(key: string): Promise<unknown | null> {
    const entry = this.#entries.get(key);
    if (entry === undefined) return null;
    if (entry.expiresAt <= this.now()) {
      this.#entries.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(
    key: string,
    value: unknown,
    ttlSeconds: number,
    tags: readonly string[],
  ): Promise<void> {
    this.#entries.set(key, {
      value,
      expiresAt: this.now() + ttlSeconds * 1_000,
      tags: [...new Set(tags)].slice(0, 64),
    });
  }

  async invalidateTags(tags: readonly string[]): Promise<void> {
    const selected = new Set(tags.slice(0, 64));
    for (const [key, entry] of this.#entries) {
      if (entry.tags.some((tag) => selected.has(tag))) this.#entries.delete(key);
    }
  }

  async close(): Promise<void> {
    this.#entries.clear();
  }
}
