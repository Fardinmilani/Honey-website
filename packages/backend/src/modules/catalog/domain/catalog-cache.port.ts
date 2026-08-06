export interface CatalogCache {
  get(key: string): Promise<unknown | null>;
  set(key: string, value: unknown, ttlSeconds: number, tags: readonly string[]): Promise<void>;
  invalidateTags(tags: readonly string[]): Promise<void>;
  close(): Promise<void>;
}
