import type { AdminPage, AdminPageInput } from '../../../platform/domain/admin-page.js';
import type { CatalogStatus, CategoryTranslationInput } from './catalog.js';
export type AdminCatalogQuery = AdminPageInput & Readonly<{ q?: string; status?: CatalogStatus }>;
export type AdminTaxonomyQuery = AdminPageInput & Readonly<{ id?: string }>;
export type AdminProductListItem = Readonly<{
  id: string;
  sku: string | null;
  status: CatalogStatus;
  updatedAt: string;
  translations: readonly Readonly<{ locale: string; name: string; slug: string }>[];
}>;
export type AdminTaxonomyItem = Readonly<{
  id: string;
  parentId: string | null;
  path: string | null;
  status: CatalogStatus | null;
  sortWeight: number;
  translations: readonly CategoryTranslationInput[];
}>;
export interface AdminCatalogRepository {
  products(query: AdminCatalogQuery): Promise<AdminPage<AdminProductListItem>>;
  categories(query: AdminTaxonomyQuery): Promise<AdminPage<AdminTaxonomyItem>>;
  collections(query: AdminTaxonomyQuery): Promise<AdminPage<AdminTaxonomyItem>>;
  close(): Promise<void>;
}
