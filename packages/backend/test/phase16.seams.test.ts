import { describe, expect, it, vi } from 'vitest';

import { BackupVerificationService } from '../src/platform/application/backup-verification.service.js';
import { SitemapRevalidationService } from '../src/platform/application/sitemap-revalidation.service.js';
import type { SitemapRevalidationPort } from '../src/platform/domain/sitemap-revalidation.port.js';

describe('Phase 16 application seams', () => {
  it('passes only validated locale and catalog identifiers to the revalidation port', async () => {
    const revalidateSitemap = vi.fn<SitemapRevalidationPort['revalidateSitemap']>();
    const revalidateCatalog = vi.fn<SitemapRevalidationPort['revalidateCatalog']>();
    const service = new SitemapRevalidationService({ revalidateSitemap, revalidateCatalog });
    await service.revalidate({ locale: 'fa', correlationId: 'job:fa:1' });
    await service.revalidate({ locale: 'en', correlationId: 'job:en:1' });
    await service.revalidateCatalog({
      scope: 'product',
      id: '018f0000-0000-7000-8000-000000000001',
      correlationId: 'event:1',
    });
    expect(revalidateSitemap).toHaveBeenCalledTimes(2);
    expect(revalidateCatalog).toHaveBeenCalledTimes(1);

    expect(() => service.revalidate({ locale: 'fa', correlationId: 'bad/url' })).toThrow();
    expect(() =>
      service.revalidateCatalog({ scope: 'product', id: 'not-a-uuid', correlationId: 'event:2' }),
    ).toThrow();
    expect(revalidateSitemap).toHaveBeenCalledTimes(2);
    expect(revalidateCatalog).toHaveBeenCalledTimes(1);
  });

  it('requires a concrete injected backup verifier and rejects invalid correlation IDs', async () => {
    const verify = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const service = new BackupVerificationService({ verify });
    await service.verify({ correlationId: 'maintenance:backup:1' });
    expect(verify).toHaveBeenCalledWith({ correlationId: 'maintenance:backup:1' });
    expect(() => service.verify({ correlationId: 'https://arbitrary.example' })).toThrow();
    expect(verify).toHaveBeenCalledTimes(1);
  });
});
