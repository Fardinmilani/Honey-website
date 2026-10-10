import type {
  CatalogRevalidationInput,
  SitemapRevalidationInput,
  SitemapRevalidationPort,
} from '../domain/sitemap-revalidation.port.js';

const CORRELATION_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function assertCorrelationId(value: string): void {
  if (!CORRELATION_ID.test(value)) throw new TypeError('Invalid revalidation correlation ID.');
}

/** A transport-neutral boundary. The worker supplies an infrastructure adapter. */
export class SitemapRevalidationService {
  constructor(private readonly port: SitemapRevalidationPort) {}

  revalidate(input: SitemapRevalidationInput): Promise<void> {
    assertCorrelationId(input.correlationId);
    if (input.locale !== 'fa' && input.locale !== 'en') {
      throw new TypeError('Invalid sitemap locale.');
    }
    return this.port.revalidateSitemap(input);
  }

  revalidateCatalog(input: CatalogRevalidationInput): Promise<void> {
    assertCorrelationId(input.correlationId);
    if (input.scope === 'catalog') {
      if (input.id !== undefined) throw new TypeError('Catalog-wide revalidation has no ID.');
    } else if (
      (input.scope !== 'product' && input.scope !== 'category' && input.scope !== 'collection') ||
      input.id === undefined ||
      !UUID.test(input.id)
    ) {
      throw new TypeError('Invalid catalog revalidation target.');
    }
    return this.port.revalidateCatalog(input);
  }
}
