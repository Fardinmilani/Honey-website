/** Only fixed, allow-listed web cache operations cross the worker/web boundary. */
export type SitemapLocale = 'fa' | 'en';

export type SitemapRevalidationInput = Readonly<{
  locale: SitemapLocale;
  correlationId: string;
}>;

export type CatalogRevalidationInput = Readonly<{
  scope: 'catalog' | 'product' | 'category' | 'collection';
  id?: string;
  correlationId: string;
}>;

export interface SitemapRevalidationPort {
  revalidateSitemap(input: SitemapRevalidationInput): Promise<void>;
  revalidateCatalog(input: CatalogRevalidationInput): Promise<void>;
}
