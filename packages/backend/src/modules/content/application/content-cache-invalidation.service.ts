import type { ContentResolutionCache } from '../domain/content-cache.js';
export class ContentCacheInvalidationService {
  constructor(private readonly cache: ContentResolutionCache) {}
  invalidateForSystem(context: Readonly<{ kind: string; source: string; correlationId: string }>) {
    if (
      context.kind !== 'SYSTEM' ||
      context.source !== 'WORKER' ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(context.correlationId)
    )
      throw new TypeError('CONTENT_INVALIDATION_CONTEXT_INVALID');
    return this.cache.invalidate();
  }
}
