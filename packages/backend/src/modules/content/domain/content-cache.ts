/** The cache resolves public slugs to IDs; PostgreSQL still gates every read. */
export interface ContentResolutionCache {
  get(key: string): Promise<string | null>;
  set(key: string, id: string): Promise<void>;
  invalidate(): Promise<void>;
  close(): Promise<void>;
}
