import { randomUUID } from 'node:crypto';

import {
  ConflictAppError,
  ForbiddenAppError,
  NotFoundAppError,
  ValidationAppError,
} from '../../../errors/index.js';
import type {
  AuthenticatedPrincipal,
  PermissionCode,
  RequestMetadata,
} from '../../identity/index.js';
import type { CatalogCache } from '../domain/catalog-cache.port.js';
import type { CatalogMediaPort } from '../domain/catalog-media.port.js';
import {
  canonicalLocale,
  cursorFingerprint,
  decodeCursor,
  encodeCursor,
  isPublicProduct,
  isPublicProductPage,
  normalizeProductTranslation,
  normalizeSearchText,
  normalizeSlug,
  normalizeTaxonomyTranslation,
  normalizeVariantTranslation,
  assertVariantShape,
  validateCatalogConfig,
  type CatalogConfig,
  type CatalogProductRecord,
  type CategoryTranslationInput,
  type CollectionTranslationInput,
  type ProductFilters,
  type ProductSort,
  type ProductTranslationInput,
  type PublicCategory,
  type PublicCollection,
  type PublicPage,
  type PublicProduct,
  type SearchSort,
  type VariantStatus,
  type VariantTranslationInput,
} from '../domain/catalog.js';
import type {
  ActorContext,
  AdminProduct,
  CatalogRepository,
  ProductInput,
  ProductMediaInput,
  SlugResolution,
  VariantInput,
} from '../domain/catalog-repository.port.js';

export type LocaleResolutionInput = Readonly<{
  explicit?: string;
  acceptLanguage?: string;
  preferredLocale?: string;
}>;

export type PublicListInput = Readonly<{
  locale: string;
  cursor?: string;
  limit?: number;
  sort?: ProductSort;
  filters?: ProductFilters;
}>;

export type PublicSearchInput = Readonly<{
  locale: string;
  query: string;
  cursor?: string;
  limit?: number;
  sort?: SearchSort;
}>;

function validation(path: string, code: string): ValidationAppError {
  return new ValidationAppError([{ path, code }]);
}

function assertAdmin(principal: AuthenticatedPrincipal, permission: PermissionCode): void {
  if (principal.kind !== 'STAFF') throw new ForbiddenAppError({ code: 'STAFF_REQUIRED' });
  if (!principal.permissions.includes(permission)) throw new ForbiddenAppError();
}

function boundedString(
  value: string | null | undefined,
  maximum: number,
  path: string,
): string | null {
  if (value === null || value === undefined) return null;
  const normalized = value.normalize('NFC').trim();
  if (
    normalized.length < 1 ||
    Array.from(normalized).length > maximum ||
    /[\u0000-\u001F\u007F-\u009F]/u.test(normalized)
  ) {
    throw validation(path, 'CATALOG_TEXT_INVALID');
  }
  return normalized;
}

function normalizeProductInput(input: ProductInput): ProductInput {
  const floralSources =
    input.floralSources?.map((value, index) => {
      const normalized = boundedString(value, 120, `floralSources.${index}`);
      if (normalized === null) throw validation(`floralSources.${index}`, 'CATALOG_TEXT_INVALID');
      return normalized;
    }) ?? [];
  if (floralSources.length > 20 || new Set(floralSources).size !== floralSources.length) {
    throw validation('floralSources', 'CATALOG_ARRAY_INVALID');
  }
  if (!Number.isSafeInteger(input.sortWeight ?? 0) || Math.abs(input.sortWeight ?? 0) > 1_000_000) {
    throw validation('sortWeight', 'CATALOG_SORT_WEIGHT_INVALID');
  }
  if (
    input.sourcingType === 'SELECTED_SUPPLIER' &&
    input.apiaryId !== null &&
    input.apiaryId !== undefined
  ) {
    throw validation('apiaryId', 'CATALOG_SOURCING_SHAPE_INVALID');
  }
  return {
    sku: boundedString(input.sku, 80, 'sku'),
    brandLine: boundedString(input.brandLine, 120, 'brandLine'),
    honeyVarietal: boundedString(input.honeyVarietal, 160, 'honeyVarietal'),
    floralSources,
    originRegion: boundedString(input.originRegion, 160, 'originRegion'),
    originAltitudeBand: boundedString(input.originAltitudeBand, 120, 'originAltitudeBand'),
    harvestSeason: boundedString(input.harvestSeason, 120, 'harvestSeason'),
    sourcingType: input.sourcingType,
    apiaryId: input.apiaryId ?? null,
    sortWeight: input.sortWeight ?? 0,
  };
}

function normalizeAltText(
  value: Readonly<Record<string, string>>,
  enabledLocales: readonly string[],
): Readonly<Record<string, string>> {
  if (Object.keys(value).length > enabledLocales.length)
    throw validation('altTextByLocale', 'ALT_TEXT_INVALID');
  const result: Record<string, string> = {};
  for (const [localeInput, textInput] of Object.entries(value)) {
    let locale: string;
    try {
      locale = canonicalLocale(localeInput);
    } catch {
      throw validation('altTextByLocale', 'LOCALE_UNSUPPORTED');
    }
    if (!enabledLocales.includes(locale)) throw validation('altTextByLocale', 'LOCALE_UNSUPPORTED');
    const text = boundedString(textInput, 300, `altTextByLocale.${locale}`);
    if (text === null) throw validation(`altTextByLocale.${locale}`, 'ALT_TEXT_INVALID');
    result[locale] = text;
  }
  return result;
}

export class CatalogService {
  readonly #config: CatalogConfig;

  constructor(
    config: CatalogConfig,
    private readonly repository: CatalogRepository,
    private readonly cache: CatalogCache,
    private readonly media: CatalogMediaPort,
  ) {
    this.#config = validateCatalogConfig(config);
  }

  resolveLocale(input: LocaleResolutionInput): string {
    if (input.explicit !== undefined) {
      let locale: string;
      try {
        locale = canonicalLocale(input.explicit);
      } catch {
        throw validation('locale', 'LOCALE_UNSUPPORTED');
      }
      if (!this.#config.enabledLocales.includes(locale))
        throw validation('locale', 'LOCALE_UNSUPPORTED');
      return locale;
    }
    const accepted = this.#acceptedLocales(input.acceptLanguage);
    const match = accepted.find((locale) => this.#config.enabledLocales.includes(locale));
    if (match !== undefined) return match;
    if (input.preferredLocale !== undefined) {
      try {
        const preferred = canonicalLocale(input.preferredLocale);
        if (this.#config.enabledLocales.includes(preferred)) return preferred;
      } catch {
        // An invalid stored preference cannot override the safe configured default.
      }
    }
    return this.#config.defaultLocale;
  }

  async listProducts(input: PublicListInput): Promise<PublicPage<PublicProduct>> {
    const locale = this.#requiredLocale(input.locale);
    const limit = this.#limit(input.limit);
    const sort = input.sort ?? 'newest';
    const filters = input.filters ?? {};
    const fingerprint = cursorFingerprint({ locale, sort, ...filters });
    const cursor =
      input.cursor === undefined ? null : this.#decodeCursor(input.cursor, fingerprint);
    const key = this.#key('products', {
      locale,
      sort,
      limit,
      cursor: input.cursor ?? '',
      ...filters,
    });
    const cached = await this.cache.get(key);
    if (isPublicProductPage(cached)) return cached;
    const rows = await this.repository.listProducts({ locale, sort, filters, limit, cursor });
    const data = await this.#enrichProducts(rows.items, locale);
    const result: PublicPage<PublicProduct> = {
      data,
      page: {
        hasMore: rows.hasMore,
        limit,
        nextCursor:
          rows.hasMore && rows.nextId !== null && rows.nextSortValue !== null
            ? encodeCursor({
                version: 1,
                fingerprint,
                sortValue: rows.nextSortValue,
                id: rows.nextId,
              })
            : null,
      },
    };
    await this.cache.set(key, result, this.#config.cacheTtlSeconds, ['catalog:products']);
    return result;
  }

  async searchProducts(input: PublicSearchInput): Promise<PublicPage<PublicProduct>> {
    const locale = this.#requiredLocale(input.locale);
    if (
      Array.from(input.query).length > this.#config.searchQueryMaxLength ||
      /;|--|\/\*|\*\//u.test(input.query)
    ) {
      throw validation('q', 'SEARCH_QUERY_INVALID');
    }
    let normalizedQuery: string;
    try {
      normalizedQuery = normalizeSearchText(input.query);
    } catch {
      throw validation('q', 'SEARCH_QUERY_INVALID');
    }
    if (normalizedQuery.length === 0) throw validation('q', 'SEARCH_QUERY_INVALID');
    const limit = this.#limit(input.limit);
    const sort = input.sort ?? 'relevance';
    const fingerprint = cursorFingerprint({ locale, sort, normalizedQuery });
    const cursor =
      input.cursor === undefined ? null : this.#decodeCursor(input.cursor, fingerprint);
    const key = this.#key('search', {
      locale,
      sort,
      limit,
      normalizedQuery,
      cursor: input.cursor ?? '',
    });
    const cached = await this.cache.get(key);
    if (isPublicProductPage(cached)) return cached;
    const rows = await this.repository.searchProducts({
      locale,
      normalizedQuery,
      sort,
      limit,
      cursor,
    });
    const data = await this.#enrichProducts(rows.items, locale);
    const result: PublicPage<PublicProduct> = {
      data,
      page: {
        hasMore: rows.hasMore,
        limit,
        nextCursor:
          rows.hasMore && rows.nextId !== null && rows.nextSortValue !== null
            ? encodeCursor({
                version: 1,
                fingerprint,
                sortValue: rows.nextSortValue,
                id: rows.nextId,
              })
            : null,
      },
    };
    await this.cache.set(key, result, this.#config.cacheTtlSeconds, [
      'catalog:products',
      'catalog:search',
    ]);
    return result;
  }

  async resolveProduct(
    localeInput: string,
    slugInput: string,
  ): Promise<SlugResolution<PublicProduct>> {
    const locale = this.#requiredLocale(localeInput);
    const slug = this.#slug(slugInput);
    const key = this.#key('product', { locale, slug });
    const cached = await this.cache.get(key);
    if (isPublicProduct(cached)) return { kind: 'FOUND', entity: cached };
    const resolution = await this.repository.resolveProductSlug(locale, slug);
    if (resolution.kind !== 'FOUND') return resolution;
    const [entity] = await this.#enrichProducts([resolution.entity], locale);
    if (entity === undefined) return { kind: 'NOT_FOUND' };
    await this.cache.set(key, entity, this.#config.cacheTtlSeconds, [
      'catalog:products',
      `product:${entity.id}`,
      `slug:${locale}:${slug}`,
    ]);
    return { kind: 'FOUND', entity };
  }

  async listCategories(localeInput: string): Promise<readonly PublicCategory[]> {
    const locale = this.#requiredLocale(localeInput);
    const cached = await this.cache.get(this.#key('categories', { locale }));
    if (Array.isArray(cached) && cached.every(this.#isCategory)) return cached;
    const categories = await this.repository.listCategories(locale);
    await this.cache.set(
      this.#key('categories', { locale }),
      categories,
      this.#config.cacheTtlSeconds,
      ['catalog:categories'],
    );
    return categories;
  }

  async resolveCategory(
    localeInput: string,
    slugInput: string,
  ): Promise<SlugResolution<PublicCategory>> {
    return this.repository.resolveCategorySlug(
      this.#requiredLocale(localeInput),
      this.#slug(slugInput),
    );
  }

  async listCollections(localeInput: string): Promise<readonly PublicCollection[]> {
    const locale = this.#requiredLocale(localeInput);
    const cached = await this.cache.get(this.#key('collections', { locale }));
    if (Array.isArray(cached) && cached.every(this.#isCollection)) return cached;
    const collections = await this.repository.listCollections(locale);
    await this.cache.set(
      this.#key('collections', { locale }),
      collections,
      this.#config.cacheTtlSeconds,
      ['catalog:collections'],
    );
    return collections;
  }

  async resolveCollection(
    localeInput: string,
    slugInput: string,
  ): Promise<SlugResolution<PublicCollection>> {
    return this.repository.resolveCollectionSlug(
      this.#requiredLocale(localeInput),
      this.#slug(slugInput),
    );
  }

  async listCategoryProducts(
    slug: string,
    input: PublicListInput,
  ): Promise<PublicPage<PublicProduct>> {
    const category = await this.resolveCategory(input.locale, slug);
    if (category.kind !== 'FOUND') {
      if (category.kind === 'REDIRECT')
        return {
          data: [],
          page: { nextCursor: null, hasMore: false, limit: this.#limit(input.limit) },
        };
      throw new NotFoundAppError();
    }
    return this.listProducts({
      ...input,
      filters: { ...(input.filters ?? {}), categoryId: category.entity.id },
    });
  }

  async listCollectionProducts(
    slug: string,
    input: PublicListInput,
  ): Promise<PublicPage<PublicProduct>> {
    const collection = await this.resolveCollection(input.locale, slug);
    if (collection.kind !== 'FOUND') {
      if (collection.kind === 'REDIRECT')
        return {
          data: [],
          page: { nextCursor: null, hasMore: false, limit: this.#limit(input.limit) },
        };
      throw new NotFoundAppError();
    }
    return this.listProducts({
      ...input,
      filters: { ...(input.filters ?? {}), collectionId: collection.entity.id },
    });
  }

  async createProduct(
    principal: AuthenticatedPrincipal,
    input: ProductInput,
    metadata: RequestMetadata,
  ): Promise<AdminProduct> {
    assertAdmin(principal, 'catalog:write');
    const product = await this.repository.createProduct(
      randomUUID(),
      normalizeProductInput(input),
      this.#actor(principal, metadata),
    );
    await this.#invalidateProduct(product.id);
    return product;
  }

  async updateProduct(
    principal: AuthenticatedPrincipal,
    id: string,
    input: ProductInput,
    metadata: RequestMetadata,
  ): Promise<AdminProduct> {
    assertAdmin(principal, 'catalog:write');
    const product = await this.repository.updateProduct(
      id,
      normalizeProductInput(input),
      this.#actor(principal, metadata),
    );
    if (product === null) throw new NotFoundAppError();
    await this.#invalidateProduct(id);
    return product;
  }

  async getAdminProduct(principal: AuthenticatedPrincipal, id: string): Promise<AdminProduct> {
    assertAdmin(principal, 'catalog:read');
    const product = await this.repository.getAdminProduct(id);
    if (product === null) throw new NotFoundAppError();
    return product;
  }

  async upsertProductTranslation(
    principal: AuthenticatedPrincipal,
    productId: string,
    input: ProductTranslationInput,
    metadata: RequestMetadata,
  ): Promise<AdminProduct> {
    assertAdmin(principal, 'catalog:write');
    let normalized: ProductTranslationInput;
    try {
      normalized = normalizeProductTranslation(input);
    } catch {
      throw validation('translation', 'PRODUCT_TRANSLATION_INVALID');
    }
    if (!this.#config.enabledLocales.includes(normalized.locale))
      throw validation('locale', 'LOCALE_UNSUPPORTED');
    const result = await this.repository.upsertProductTranslation(
      productId,
      randomUUID(),
      normalized,
      this.#actor(principal, metadata),
    );
    if (result === null) throw new NotFoundAppError();
    await this.cache.invalidateTags([
      'catalog:products',
      'catalog:search',
      `product:${productId}`,
      `slug:${normalized.locale}:${normalized.slug}`,
      ...(result.oldSlug === null ? [] : [`slug:${normalized.locale}:${result.oldSlug}`]),
    ]);
    return result.product;
  }

  async createVariant(
    principal: AuthenticatedPrincipal,
    productId: string,
    input: VariantInput,
    metadata: RequestMetadata,
  ): Promise<AdminProduct> {
    assertAdmin(principal, 'catalog:write');
    try {
      assertVariantShape(input);
    } catch {
      throw validation('variant', 'VARIANT_INVALID');
    }
    const product = await this.repository.createVariant(
      productId,
      randomUUID(),
      input,
      this.#actor(principal, metadata),
    );
    if (product === null) throw new NotFoundAppError();
    await this.#invalidateProduct(productId);
    return product;
  }

  async updateVariant(
    principal: AuthenticatedPrincipal,
    productId: string,
    variantId: string,
    input: VariantInput,
    metadata: RequestMetadata,
  ): Promise<AdminProduct> {
    assertAdmin(principal, 'catalog:write');
    try {
      assertVariantShape(input);
    } catch {
      throw validation('variant', 'VARIANT_INVALID');
    }
    const product = await this.repository.updateVariant(
      productId,
      variantId,
      input,
      this.#actor(principal, metadata),
    );
    if (product === null) throw new NotFoundAppError();
    await this.#invalidateProduct(productId);
    return product;
  }

  async updateVariantStatus(
    principal: AuthenticatedPrincipal,
    productId: string,
    variantId: string,
    status: Exclude<VariantStatus, 'DRAFT'>,
    metadata: RequestMetadata,
  ): Promise<AdminProduct> {
    assertAdmin(principal, 'catalog:publish');
    const product = await this.repository.updateVariantStatus(
      productId,
      variantId,
      status,
      this.#actor(principal, metadata),
    );
    if (product === null) throw new NotFoundAppError();
    await this.#invalidateProduct(productId);
    return product;
  }

  async upsertVariantTranslation(
    principal: AuthenticatedPrincipal,
    productId: string,
    variantId: string,
    input: VariantTranslationInput,
    metadata: RequestMetadata,
  ): Promise<AdminProduct> {
    assertAdmin(principal, 'catalog:write');
    let normalized: VariantTranslationInput;
    try {
      normalized = normalizeVariantTranslation(input);
    } catch {
      throw validation('translation', 'VARIANT_TRANSLATION_INVALID');
    }
    if (!this.#config.enabledLocales.includes(normalized.locale))
      throw validation('locale', 'LOCALE_UNSUPPORTED');
    const product = await this.repository.upsertVariantTranslation(
      productId,
      variantId,
      randomUUID(),
      normalized,
      this.#actor(principal, metadata),
    );
    if (product === null) throw new NotFoundAppError();
    await this.#invalidateProduct(productId);
    return product;
  }

  async setDefaultVariant(
    principal: AuthenticatedPrincipal,
    productId: string,
    variantId: string,
    metadata: RequestMetadata,
  ): Promise<AdminProduct> {
    assertAdmin(principal, 'catalog:write');
    const product = await this.repository.setDefaultVariant(
      productId,
      variantId,
      this.#actor(principal, metadata),
    );
    if (product === null) throw new NotFoundAppError();
    await this.#invalidateProduct(productId);
    return product;
  }

  async transitionProduct(
    principal: AuthenticatedPrincipal,
    productId: string,
    target: 'PUBLISHED' | 'ARCHIVED',
    metadata: RequestMetadata,
  ): Promise<AdminProduct> {
    assertAdmin(principal, 'catalog:publish');
    const current = await this.repository.getAdminProduct(productId);
    if (current === null) throw new NotFoundAppError();
    const assets = await this.media.resolvePublicAssets([
      ...new Set(current.media.map((entry) => entry.mediaAssetId)),
    ]);
    const product = await this.repository.transitionProduct(
      productId,
      target,
      this.#config.enabledLocales,
      new Set(assets.map((asset) => asset.id)),
      this.#actor(principal, metadata),
    );
    if (product === null) throw new NotFoundAppError();
    await this.#invalidateProduct(productId);
    return product;
  }

  async createCategory(
    principal: AuthenticatedPrincipal,
    parentId: string | null,
    sortWeight: number,
    metadata: RequestMetadata,
  ): Promise<Readonly<{ id: string }>> {
    assertAdmin(principal, 'catalog:write');
    if (!Number.isSafeInteger(sortWeight) || Math.abs(sortWeight) > 1_000_000)
      throw validation('sortWeight', 'CATALOG_SORT_WEIGHT_INVALID');
    const id = randomUUID();
    await this.repository.createCategory(
      id,
      parentId,
      sortWeight,
      this.#config.maximumCategoryDepth,
      this.#actor(principal, metadata),
    );
    await this.cache.invalidateTags(['catalog:categories', 'catalog:products']);
    return { id };
  }

  async moveCategory(
    principal: AuthenticatedPrincipal,
    id: string,
    parentId: string | null,
    metadata: RequestMetadata,
  ): Promise<void> {
    assertAdmin(principal, 'catalog:write');
    if (
      !(await this.repository.moveCategory(
        id,
        parentId,
        this.#config.maximumCategoryDepth,
        this.#actor(principal, metadata),
      ))
    )
      throw new NotFoundAppError();
    await this.cache.invalidateTags(['catalog:categories', 'catalog:products', `category:${id}`]);
  }

  async updateCategory(
    principal: AuthenticatedPrincipal,
    id: string,
    sortWeight: number,
    metadata: RequestMetadata,
  ): Promise<void> {
    assertAdmin(principal, 'catalog:write');
    if (!Number.isSafeInteger(sortWeight) || Math.abs(sortWeight) > 1_000_000)
      throw validation('sortWeight', 'CATALOG_SORT_WEIGHT_INVALID');
    if (!(await this.repository.updateCategory(id, sortWeight, this.#actor(principal, metadata))))
      throw new NotFoundAppError();
    await this.cache.invalidateTags(['catalog:categories', 'catalog:products', `category:${id}`]);
  }

  async upsertCategoryTranslation(
    principal: AuthenticatedPrincipal,
    id: string,
    input: CategoryTranslationInput,
    metadata: RequestMetadata,
  ): Promise<void> {
    assertAdmin(principal, 'catalog:write');
    let normalized: CategoryTranslationInput;
    try {
      normalized = normalizeTaxonomyTranslation(input);
    } catch {
      throw validation('translation', 'CATEGORY_TRANSLATION_INVALID');
    }
    if (!this.#config.enabledLocales.includes(normalized.locale))
      throw validation('locale', 'LOCALE_UNSUPPORTED');
    const result = await this.repository.upsertCategoryTranslation(
      id,
      randomUUID(),
      normalized,
      this.#actor(principal, metadata),
    );
    if (result === null) throw new NotFoundAppError();
    await this.cache.invalidateTags([
      'catalog:categories',
      'catalog:products',
      `category:${id}`,
      `slug:${normalized.locale}:${normalized.slug}`,
      ...(result.oldSlug === null ? [] : [`slug:${normalized.locale}:${result.oldSlug}`]),
    ]);
  }

  async createCollection(
    principal: AuthenticatedPrincipal,
    sortWeight: number,
    metadata: RequestMetadata,
  ): Promise<Readonly<{ id: string }>> {
    assertAdmin(principal, 'catalog:write');
    if (!Number.isSafeInteger(sortWeight) || Math.abs(sortWeight) > 1_000_000)
      throw validation('sortWeight', 'CATALOG_SORT_WEIGHT_INVALID');
    const id = randomUUID();
    await this.repository.createCollection(id, sortWeight, this.#actor(principal, metadata));
    await this.cache.invalidateTags(['catalog:collections']);
    return { id };
  }

  async updateCollection(
    principal: AuthenticatedPrincipal,
    id: string,
    sortWeight: number,
    metadata: RequestMetadata,
  ): Promise<void> {
    assertAdmin(principal, 'catalog:write');
    if (!Number.isSafeInteger(sortWeight) || Math.abs(sortWeight) > 1_000_000)
      throw validation('sortWeight', 'CATALOG_SORT_WEIGHT_INVALID');
    if (!(await this.repository.updateCollection(id, sortWeight, this.#actor(principal, metadata))))
      throw new NotFoundAppError();
    await this.cache.invalidateTags([
      'catalog:collections',
      'catalog:products',
      `collection:${id}`,
    ]);
  }

  async upsertCollectionTranslation(
    principal: AuthenticatedPrincipal,
    id: string,
    input: CollectionTranslationInput,
    metadata: RequestMetadata,
  ): Promise<void> {
    assertAdmin(principal, 'catalog:write');
    let normalized: CollectionTranslationInput;
    try {
      normalized = normalizeTaxonomyTranslation(input);
    } catch {
      throw validation('translation', 'COLLECTION_TRANSLATION_INVALID');
    }
    if (!this.#config.enabledLocales.includes(normalized.locale))
      throw validation('locale', 'LOCALE_UNSUPPORTED');
    const result = await this.repository.upsertCollectionTranslation(
      id,
      randomUUID(),
      normalized,
      this.#actor(principal, metadata),
    );
    if (result === null) throw new NotFoundAppError();
    await this.cache.invalidateTags([
      'catalog:collections',
      'catalog:products',
      `collection:${id}`,
      `slug:${normalized.locale}:${normalized.slug}`,
      ...(result.oldSlug === null ? [] : [`slug:${normalized.locale}:${result.oldSlug}`]),
    ]);
  }

  async transitionCollection(
    principal: AuthenticatedPrincipal,
    id: string,
    target: 'PUBLISHED' | 'ARCHIVED',
    metadata: RequestMetadata,
  ): Promise<void> {
    assertAdmin(principal, 'catalog:publish');
    if (
      !(await this.repository.transitionCollection(
        id,
        target,
        this.#config.enabledLocales,
        this.#actor(principal, metadata),
      ))
    )
      throw new NotFoundAppError();
    await this.cache.invalidateTags([
      'catalog:collections',
      'catalog:products',
      `collection:${id}`,
    ]);
  }

  async assignCategory(
    principal: AuthenticatedPrincipal,
    productId: string,
    categoryId: string,
    primary: boolean,
    metadata: RequestMetadata,
  ): Promise<void> {
    assertAdmin(principal, 'catalog:write');
    if (
      !(await this.repository.assignProductCategory(
        productId,
        categoryId,
        primary,
        this.#actor(principal, metadata),
      ))
    )
      throw new NotFoundAppError();
    await this.#invalidateProduct(productId);
  }

  async unassignCategory(
    principal: AuthenticatedPrincipal,
    productId: string,
    categoryId: string,
    metadata: RequestMetadata,
  ): Promise<void> {
    assertAdmin(principal, 'catalog:write');
    if (
      !(await this.repository.unassignProductCategory(
        productId,
        categoryId,
        this.#actor(principal, metadata),
      ))
    )
      throw new NotFoundAppError();
    await this.#invalidateProduct(productId);
  }

  async assignCollection(
    principal: AuthenticatedPrincipal,
    productId: string,
    collectionId: string,
    position: number,
    metadata: RequestMetadata,
  ): Promise<void> {
    assertAdmin(principal, 'catalog:write');
    if (!Number.isSafeInteger(position) || position < 0 || position > 10_000)
      throw validation('position', 'POSITION_INVALID');
    if (
      !(await this.repository.assignProductCollection(
        productId,
        collectionId,
        position,
        this.#actor(principal, metadata),
      ))
    )
      throw new NotFoundAppError();
    await this.#invalidateProduct(productId);
  }

  async unassignCollection(
    principal: AuthenticatedPrincipal,
    productId: string,
    collectionId: string,
    metadata: RequestMetadata,
  ): Promise<void> {
    assertAdmin(principal, 'catalog:write');
    if (
      !(await this.repository.unassignProductCollection(
        productId,
        collectionId,
        this.#actor(principal, metadata),
      ))
    )
      throw new NotFoundAppError();
    await this.#invalidateProduct(productId);
  }

  async attachMedia(
    principal: AuthenticatedPrincipal,
    productId: string,
    input: ProductMediaInput,
    metadata: RequestMetadata,
  ): Promise<AdminProduct> {
    assertAdmin(principal, 'catalog:write');
    const assets = await this.media.resolvePublicAssets([input.mediaAssetId]);
    if (assets.length !== 1) throw new ConflictAppError({ code: 'MEDIA_ASSET_NOT_PUBLIC' });
    if (!Number.isSafeInteger(input.position) || input.position < 0 || input.position > 10_000)
      throw validation('position', 'POSITION_INVALID');
    const product = await this.repository.attachProductMedia(
      productId,
      randomUUID(),
      {
        ...input,
        altTextByLocale: normalizeAltText(input.altTextByLocale, this.#config.enabledLocales),
      },
      this.#actor(principal, metadata),
    );
    if (product === null) throw new NotFoundAppError();
    await this.#invalidateProduct(productId);
    return product;
  }

  async updateMedia(
    principal: AuthenticatedPrincipal,
    productId: string,
    attachmentId: string,
    input: Pick<ProductMediaInput, 'position' | 'role' | 'altTextByLocale'>,
    metadata: RequestMetadata,
  ): Promise<AdminProduct> {
    assertAdmin(principal, 'catalog:write');
    const product = await this.repository.updateProductMedia(
      productId,
      attachmentId,
      {
        ...input,
        altTextByLocale: normalizeAltText(input.altTextByLocale, this.#config.enabledLocales),
      },
      this.#actor(principal, metadata),
    );
    if (product === null) throw new NotFoundAppError();
    await this.#invalidateProduct(productId);
    return product;
  }

  async detachMedia(
    principal: AuthenticatedPrincipal,
    productId: string,
    attachmentId: string,
    metadata: RequestMetadata,
  ): Promise<void> {
    assertAdmin(principal, 'catalog:write');
    if (
      !(await this.repository.detachProductMedia(
        productId,
        attachmentId,
        this.#actor(principal, metadata),
      ))
    )
      throw new NotFoundAppError();
    await this.#invalidateProduct(productId);
  }

  async close(): Promise<void> {
    await Promise.allSettled([this.repository.close(), this.cache.close()]);
  }

  #requiredLocale(value: string): string {
    let locale: string;
    try {
      locale = canonicalLocale(value);
    } catch {
      throw validation('locale', 'LOCALE_UNSUPPORTED');
    }
    if (!this.#config.enabledLocales.includes(locale))
      throw validation('locale', 'LOCALE_UNSUPPORTED');
    return locale;
  }

  #slug(value: string): string {
    try {
      return normalizeSlug(value);
    } catch {
      throw validation('slug', 'SLUG_INVALID');
    }
  }

  #limit(value: number | undefined): number {
    const limit = value ?? 24;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
      throw validation('limit', 'PAGE_LIMIT_INVALID');
    return limit;
  }

  #decodeCursor(value: string, fingerprint: string) {
    try {
      return decodeCursor(value, fingerprint);
    } catch {
      throw validation('cursor', 'CURSOR_INVALID');
    }
  }

  #acceptedLocales(value: string | undefined): readonly string[] {
    if (value === undefined) return [];
    return value
      .split(',')
      .map((part) => part.trim().split(';')[0]?.trim())
      .filter((part): part is string => part !== undefined && part !== '*')
      .flatMap((part) => {
        try {
          return [canonicalLocale(part)];
        } catch {
          return [];
        }
      });
  }

  async #enrichProducts(
    products: readonly CatalogProductRecord[],
    locale: string,
  ): Promise<readonly PublicProduct[]> {
    const ids = [
      ...new Set(products.flatMap((product) => product.media.map((entry) => entry.mediaAssetId))),
    ];
    const assets = await this.media.resolvePublicAssets(ids);
    const byId = new Map(assets.map((asset) => [asset.id, asset]));
    return products.map((product) => ({
      ...product,
      media: product.media.flatMap((attachment) => {
        const asset = byId.get(attachment.mediaAssetId);
        if (asset === undefined) return [];
        return [
          {
            id: attachment.id,
            role: attachment.role,
            kind: asset.kind,
            position: attachment.position,
            width: asset.width,
            height: asset.height,
            url: asset.url,
            altText: attachment.altTextByLocale[locale] ?? asset.altTextByLocale[locale] ?? '',
          },
        ];
      }),
    }));
  }

  #key(scope: string, values: Readonly<Record<string, string | number | undefined>>): string {
    const serialized = Object.entries(values)
      .filter((entry) => entry[1] !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
      .join('&');
    return `${scope}?${serialized}`;
  }

  #actor(principal: AuthenticatedPrincipal, metadata: RequestMetadata): ActorContext {
    return { actorUserId: principal.userId, metadata };
  }

  #invalidateProduct(productId: string): Promise<void> {
    return this.cache.invalidateTags([
      'catalog:products',
      'catalog:search',
      `product:${productId}`,
      'catalog:categories',
      'catalog:collections',
    ]);
  }

  #isCategory(value: unknown): value is PublicCategory {
    return (
      value !== null &&
      typeof value === 'object' &&
      'id' in value &&
      typeof value.id === 'string' &&
      'slug' in value &&
      typeof value.slug === 'string' &&
      'path' in value &&
      typeof value.path === 'string'
    );
  }

  #isCollection(value: unknown): value is PublicCollection {
    return (
      value !== null &&
      typeof value === 'object' &&
      'id' in value &&
      typeof value.id === 'string' &&
      'slug' in value &&
      typeof value.slug === 'string' &&
      'publishedAt' in value &&
      typeof value.publishedAt === 'string'
    );
  }
}
