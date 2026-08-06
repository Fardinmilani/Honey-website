import type { RequestMetadata } from '../../identity/index.js';
import type {
  CatalogEntityType,
  CatalogProductRecord,
  CategoryTranslationInput,
  CollectionTranslationInput,
  CursorPayload,
  ProductFilters,
  ProductMediaRole,
  ProductSort,
  ProductTranslationInput,
  PublicCategory,
  PublicCollection,
  SearchSort,
  VariantStatus,
  VariantTranslationInput,
} from './catalog.js';

export type ActorContext = Readonly<{
  actorUserId: string;
  metadata: RequestMetadata;
}>;

export type ProductInput = Readonly<{
  sku?: string | null;
  brandLine?: string | null;
  honeyVarietal?: string | null;
  floralSources?: readonly string[];
  originRegion?: string | null;
  originAltitudeBand?: string | null;
  harvestSeason?: string | null;
  sourcingType: 'OWN_PRODUCTION' | 'SELECTED_SUPPLIER';
  apiaryId?: string | null;
  sortWeight?: number;
}>;

export type VariantInput = Readonly<{
  sku: string;
  netWeightGrams: number;
  jarSizeLabelKey: string;
  packagingTypeKey: string;
  barcode?: string | null;
  weightGramsShipping: number;
  dimensionsMm: readonly number[];
  position: number;
}>;

export type ProductMediaInput = Readonly<{
  variantId?: string | null;
  mediaAssetId: string;
  role: ProductMediaRole;
  position: number;
  altTextByLocale: Readonly<Record<string, string>>;
}>;

export type AdminProduct = Readonly<{
  id: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  publishedAt: string | null;
  sku: string | null;
  brandLine: string | null;
  honeyVarietal: string | null;
  floralSources: readonly string[];
  originRegion: string | null;
  originAltitudeBand: string | null;
  harvestSeason: string | null;
  sourcingType: 'OWN_PRODUCTION' | 'SELECTED_SUPPLIER';
  apiaryId: string | null;
  sortWeight: number;
  primaryCategoryId: string | null;
  defaultVariantId: string | null;
  translations: readonly (ProductTranslationInput & Readonly<{ id: string }>)[];
  variants: readonly Readonly<{
    id: string;
    productId: string;
    sku: string;
    status: VariantStatus;
    netWeightGrams: number;
    jarSizeLabelKey: string;
    packagingTypeKey: string;
    barcode: string | null;
    weightGramsShipping: number;
    dimensionsMm: readonly number[];
    position: number;
    isDefault: boolean;
    deletedAt: string | null;
    translations: readonly (VariantTranslationInput & Readonly<{ id: string }>)[];
  }>[];
  categories: readonly Readonly<{ id: string; deletedAt: string | null }>[];
  collections: readonly Readonly<{ id: string; position: number }>[];
  media: readonly Readonly<{
    id: string;
    variantId: string | null;
    mediaAssetId: string;
    role: ProductMediaRole;
    position: number;
    altTextByLocale: Readonly<Record<string, string>>;
  }>[];
}>;

export type SlugResolution<Entity> =
  | Readonly<{ kind: 'FOUND'; entity: Entity }>
  | Readonly<{ kind: 'REDIRECT'; currentSlug: string }>
  | Readonly<{ kind: 'NOT_FOUND' }>;

export type PublicQuery = Readonly<{
  locale: string;
  sort: ProductSort;
  filters: ProductFilters;
  limit: number;
  cursor: CursorPayload | null;
}>;

export type SearchQuery = Readonly<{
  locale: string;
  normalizedQuery: string;
  sort: SearchSort;
  limit: number;
  cursor: CursorPayload | null;
}>;

export type ProductRows = Readonly<{
  items: readonly CatalogProductRecord[];
  hasMore: boolean;
  nextSortValue: string | number | null;
  nextId: string | null;
}>;

export interface CatalogRepository {
  createProduct(id: string, input: ProductInput, actor: ActorContext): Promise<AdminProduct>;
  updateProduct(id: string, input: ProductInput, actor: ActorContext): Promise<AdminProduct | null>;
  getAdminProduct(id: string): Promise<AdminProduct | null>;
  upsertProductTranslation(
    id: string,
    translationId: string,
    input: ProductTranslationInput,
    actor: ActorContext,
  ): Promise<Readonly<{ product: AdminProduct; oldSlug: string | null }> | null>;
  createVariant(
    productId: string,
    variantId: string,
    input: VariantInput,
    actor: ActorContext,
  ): Promise<AdminProduct | null>;
  updateVariant(
    productId: string,
    variantId: string,
    input: VariantInput,
    actor: ActorContext,
  ): Promise<AdminProduct | null>;
  updateVariantStatus(
    productId: string,
    variantId: string,
    status: Exclude<VariantStatus, 'DRAFT'>,
    actor: ActorContext,
  ): Promise<AdminProduct | null>;
  upsertVariantTranslation(
    productId: string,
    variantId: string,
    translationId: string,
    input: VariantTranslationInput,
    actor: ActorContext,
  ): Promise<AdminProduct | null>;
  setDefaultVariant(
    productId: string,
    variantId: string,
    actor: ActorContext,
  ): Promise<AdminProduct | null>;
  transitionProduct(
    productId: string,
    target: 'PUBLISHED' | 'ARCHIVED',
    enabledLocales: readonly string[],
    validMediaAssetIds: ReadonlySet<string>,
    actor: ActorContext,
  ): Promise<AdminProduct | null>;
  createCategory(
    id: string,
    parentId: string | null,
    sortWeight: number,
    maximumDepth: number,
    actor: ActorContext,
  ): Promise<string>;
  updateCategory(id: string, sortWeight: number, actor: ActorContext): Promise<boolean>;
  moveCategory(
    id: string,
    parentId: string | null,
    maximumDepth: number,
    actor: ActorContext,
  ): Promise<boolean>;
  upsertCategoryTranslation(
    categoryId: string,
    translationId: string,
    input: CategoryTranslationInput,
    actor: ActorContext,
  ): Promise<Readonly<{ oldSlug: string | null }> | null>;
  createCollection(id: string, sortWeight: number, actor: ActorContext): Promise<string>;
  updateCollection(id: string, sortWeight: number, actor: ActorContext): Promise<boolean>;
  upsertCollectionTranslation(
    collectionId: string,
    translationId: string,
    input: CollectionTranslationInput,
    actor: ActorContext,
  ): Promise<Readonly<{ oldSlug: string | null }> | null>;
  transitionCollection(
    collectionId: string,
    target: 'PUBLISHED' | 'ARCHIVED',
    enabledLocales: readonly string[],
    actor: ActorContext,
  ): Promise<boolean>;
  assignProductCategory(
    productId: string,
    categoryId: string,
    primary: boolean,
    actor: ActorContext,
  ): Promise<boolean>;
  unassignProductCategory(
    productId: string,
    categoryId: string,
    actor: ActorContext,
  ): Promise<boolean>;
  assignProductCollection(
    productId: string,
    collectionId: string,
    position: number,
    actor: ActorContext,
  ): Promise<boolean>;
  unassignProductCollection(
    productId: string,
    collectionId: string,
    actor: ActorContext,
  ): Promise<boolean>;
  attachProductMedia(
    productId: string,
    attachmentId: string,
    input: ProductMediaInput,
    actor: ActorContext,
  ): Promise<AdminProduct | null>;
  updateProductMedia(
    productId: string,
    attachmentId: string,
    input: Pick<ProductMediaInput, 'position' | 'role' | 'altTextByLocale'>,
    actor: ActorContext,
  ): Promise<AdminProduct | null>;
  detachProductMedia(
    productId: string,
    attachmentId: string,
    actor: ActorContext,
  ): Promise<boolean>;
  listProducts(query: PublicQuery): Promise<ProductRows>;
  searchProducts(query: SearchQuery): Promise<ProductRows>;
  resolveProductSlug(locale: string, slug: string): Promise<SlugResolution<CatalogProductRecord>>;
  listCategories(locale: string): Promise<readonly PublicCategory[]>;
  resolveCategorySlug(locale: string, slug: string): Promise<SlugResolution<PublicCategory>>;
  listCollections(locale: string): Promise<readonly PublicCollection[]>;
  resolveCollectionSlug(locale: string, slug: string): Promise<SlugResolution<PublicCollection>>;
  close(): Promise<void>;
}

export function entityCacheTag(type: CatalogEntityType, id: string): string {
  return `${type.toLowerCase()}:${id}`;
}
