import { createHash } from 'node:crypto';

export const CATALOG_ENTITY_TYPES = ['PRODUCT', 'CATEGORY', 'COLLECTION'] as const;
export const CATALOG_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export const VARIANT_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export const MEDIA_ROLES = ['GALLERY', 'THUMBNAIL', 'LIFESTYLE', 'VIDEO'] as const;
export const PRODUCT_SORTS = ['newest', 'oldest', 'name', 'sort-weight'] as const;
export const SEARCH_SORTS = ['relevance', 'newest', 'name'] as const;

export type CatalogEntityType = (typeof CATALOG_ENTITY_TYPES)[number];
export type CatalogStatus = (typeof CATALOG_STATUSES)[number];
export type VariantStatus = (typeof VARIANT_STATUSES)[number];
export type ProductMediaRole = (typeof MEDIA_ROLES)[number];
export type ProductSort = (typeof PRODUCT_SORTS)[number];
export type SearchSort = (typeof SEARCH_SORTS)[number];

export type CatalogConfig = Readonly<{
  enabledLocales: readonly string[];
  defaultLocale: string;
  cacheTtlSeconds: number;
  cacheNamespace: string;
  searchQueryMaxLength: number;
  maximumCategoryDepth: number;
}>;

export type ProductTranslationInput = Readonly<{
  locale: string;
  name: string;
  slug: string;
  shortDescription?: string | null;
  description?: string | null;
  tastingNotes?: string | null;
  pairingSuggestions?: string | null;
  storyHtml?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
}>;

export type VariantTranslationInput = Readonly<{
  locale: string;
  name: string;
}>;

export type CategoryTranslationInput = Readonly<{
  locale: string;
  name: string;
  slug: string;
  description?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
}>;

export type CollectionTranslationInput = CategoryTranslationInput;

export type PublicMedia = Readonly<{
  id: string;
  role: ProductMediaRole;
  kind: 'IMAGE' | 'VIDEO';
  position: number;
  width: number | null;
  height: number | null;
  url: string;
  altText: string;
}>;

export type PublicVariant = Readonly<{
  id: string;
  sku: string;
  name: string;
  netWeightGrams: number;
  jarSizeLabelKey: string;
  packagingTypeKey: string;
  weightGramsShipping: number;
  dimensionsMm: readonly [number, number, number];
  position: number;
  isDefault: boolean;
}>;

export type PublicProduct = Readonly<{
  id: string;
  name: string;
  slug: string;
  brandLine: string | null;
  shortDescription: string | null;
  description: string | null;
  tastingNotes: string | null;
  pairingSuggestions: string | null;
  storyHtml: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  honeyVarietal: string | null;
  floralSources: readonly string[];
  originRegion: string | null;
  originAltitudeBand: string | null;
  harvestSeason: string | null;
  publishedAt: string;
  variants: readonly PublicVariant[];
  media: readonly PublicMedia[];
}>;

export type CatalogProductRecord = Omit<PublicProduct, 'media'> &
  Readonly<{
    media: readonly Readonly<{
      id: string;
      mediaAssetId: string;
      role: ProductMediaRole;
      position: number;
      altTextByLocale: Readonly<Record<string, string>>;
    }>[];
  }>;

export type PublicCategory = Readonly<{
  id: string;
  parentId: string | null;
  path: string;
  name: string;
  slug: string;
  description: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  sortWeight: number;
}>;

export type PublicCollection = Readonly<{
  id: string;
  name: string;
  slug: string;
  description: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  sortWeight: number;
  publishedAt: string;
}>;

export type PageInfo = Readonly<{
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
}>;

export type PublicPage<Item> = Readonly<{
  data: readonly Item[];
  page: PageInfo;
}>;

export type ProductFilters = Readonly<{
  categoryId?: string;
  collectionId?: string;
  honeyVarietal?: string;
  originRegion?: string;
  floralSource?: string;
  minimumNetWeightGrams?: number;
  maximumNetWeightGrams?: number;
}>;

export type CursorPayload = Readonly<{
  version: 1;
  fingerprint: string;
  sortValue: string | number;
  id: string;
}>;

const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F-\u009F]/u;
const DIACRITICS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/gu;
const UNSAFE_SLUG = /[\\/.]/u;
const SLUG_CHARACTERS = /^[\p{L}\p{N}-]+$/u;
const SAFE_LOCALE = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/u;
const ALLOWED_TAGS = new Set(['p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'blockquote', 'a']);
const BANNED_RICH_TAGS =
  /<(?:script|style|iframe|object|embed|form|input|button|textarea|select|link|meta|base)\b/iu;
const HTML_TAG = /<([^<>]+)>/gu;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function length(value: string): number {
  return Array.from(value).length;
}

function assertBounded(value: string, minimum: number, maximum: number, field: string): string {
  const normalized = value.normalize('NFC').trim();
  const size = length(normalized);
  if (size < minimum || size > maximum || CONTROL_CHARACTERS.test(normalized)) {
    throw new TypeError(`${field} is invalid.`);
  }
  return normalized;
}

export function canonicalLocale(value: string): string {
  const candidate = value.normalize('NFC').trim();
  if (!SAFE_LOCALE.test(candidate)) throw new TypeError('Locale is invalid.');
  const [language, ...rest] = candidate.split('-');
  if (language === undefined) throw new TypeError('Locale is invalid.');
  return [language.toLowerCase(), ...rest.map((part) => part.toLowerCase())].join('-');
}

export function validateCatalogConfig(config: CatalogConfig): CatalogConfig {
  const enabledLocales = config.enabledLocales.map(canonicalLocale);
  if (enabledLocales.length === 0 || new Set(enabledLocales).size !== enabledLocales.length) {
    throw new TypeError('Enabled locales must be non-empty and unique.');
  }
  const defaultLocale = canonicalLocale(config.defaultLocale);
  if (!enabledLocales.includes(defaultLocale)) {
    throw new TypeError('The default locale must be enabled.');
  }
  if (config.cacheTtlSeconds < 5 || config.cacheTtlSeconds > 300) {
    throw new TypeError('Catalog cache TTL is outside the safe range.');
  }
  if (!/^[a-z0-9][a-z0-9:_-]{1,63}$/u.test(config.cacheNamespace)) {
    throw new TypeError('Catalog cache namespace is invalid.');
  }
  if (config.searchQueryMaxLength < 20 || config.searchQueryMaxLength > 500) {
    throw new TypeError('Catalog search limit is outside the safe range.');
  }
  if (config.maximumCategoryDepth < 1 || config.maximumCategoryDepth > 12) {
    throw new TypeError('Category depth is outside the safe range.');
  }
  return { ...config, enabledLocales, defaultLocale };
}

export function normalizeSearchText(value: string): string {
  if (CONTROL_CHARACTERS.test(value)) throw new TypeError('Search contains control characters.');
  return value
    .normalize('NFKC')
    .replaceAll('ي', 'ی')
    .replaceAll('ى', 'ی')
    .replaceAll('ك', 'ک')
    .replaceAll('\u200c', ' ')
    .replaceAll('\u0640', '')
    .replace(DIACRITICS, '')
    .toLocaleLowerCase('und')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function normalizeSlug(value: string): string {
  const raw = value.normalize('NFKC').trim();
  if (CONTROL_CHARACTERS.test(raw) || UNSAFE_SLUG.test(raw) || raw.includes('..')) {
    throw new TypeError('Slug contains an unsafe path character.');
  }
  const normalized = raw
    .replaceAll('ي', 'ی')
    .replaceAll('ى', 'ی')
    .replaceAll('ك', 'ک')
    .toLocaleLowerCase('und')
    .replace(/[\s_\u200c–—]+/gu, '-')
    .replace(/-+/gu, '-')
    .replace(/^-|-$/gu, '');
  if (length(normalized) < 1 || length(normalized) > 160 || !SLUG_CHARACTERS.test(normalized)) {
    throw new TypeError('Slug is invalid.');
  }
  return normalized;
}

function escapeText(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function safeHref(value: string): string {
  const decoded = value.trim();
  if (!/^(?:https?:\/\/|mailto:)/iu.test(decoded)) throw new TypeError('Story link is unsafe.');
  return decoded
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function canonicalTag(source: string): string {
  const token = source.trim();
  const closing = token.startsWith('/');
  const body = closing ? token.slice(1).trim() : token;
  const match = /^([A-Za-z0-9]+)([\s\S]*)$/u.exec(body);
  const name = match?.[1]?.toLowerCase();
  const attributes = match?.[2]?.trim() ?? '';
  if (name === undefined || !ALLOWED_TAGS.has(name))
    throw new TypeError('Story tag is not allowed.');
  if (closing) {
    if (attributes.length > 0 || name === 'br')
      throw new TypeError('Story closing tag is invalid.');
    return `</${name}>`;
  }
  if (name === 'br') {
    if (attributes !== '' && attributes !== '/')
      throw new TypeError('Story attributes are invalid.');
    return '<br>';
  }
  if (name !== 'a') {
    if (attributes.length > 0) throw new TypeError('Story attributes are not allowed.');
    return `<${name}>`;
  }
  const hrefMatch = /^href\s*=\s*(["'])([^"']+)\1$/iu.exec(attributes);
  const href = hrefMatch?.[2];
  if (href === undefined) throw new TypeError('Story links require one safe href.');
  return `<a href="${safeHref(href)}" rel="noopener noreferrer">`;
}

export function sanitizeStoryHtml(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const input = assertBounded(value, 1, 20_000, 'storyHtml');
  if (BANNED_RICH_TAGS.test(input) || /<!--|<!doctype|<\?/iu.test(input)) {
    throw new TypeError('Story content contains active markup.');
  }
  let result = '';
  let position = 0;
  for (const match of input.matchAll(HTML_TAG)) {
    const index = match.index;
    const tag = match[1];
    if (index === undefined || tag === undefined) throw new TypeError('Story content is invalid.');
    result += escapeText(input.slice(position, index));
    result += canonicalTag(tag);
    position = index + match[0].length;
  }
  result += escapeText(input.slice(position));
  if (result.includes('&lt;') && /<[^>]*$/u.test(input))
    throw new TypeError('Story markup is malformed.');
  return result;
}

function optionalText(
  value: string | null | undefined,
  maximum: number,
  field: string,
): string | null {
  if (value === null || value === undefined) return null;
  return assertBounded(value, 1, maximum, field);
}

export function normalizeProductTranslation(
  input: ProductTranslationInput,
): ProductTranslationInput {
  return {
    locale: canonicalLocale(input.locale),
    name: assertBounded(input.name, 1, 200, 'name'),
    slug: normalizeSlug(input.slug),
    shortDescription: optionalText(input.shortDescription, 500, 'shortDescription'),
    description: optionalText(input.description, 5_000, 'description'),
    tastingNotes: optionalText(input.tastingNotes, 1_000, 'tastingNotes'),
    pairingSuggestions: optionalText(input.pairingSuggestions, 1_000, 'pairingSuggestions'),
    storyHtml: sanitizeStoryHtml(input.storyHtml),
    metaTitle: optionalText(input.metaTitle, 70, 'metaTitle'),
    metaDescription: optionalText(input.metaDescription, 170, 'metaDescription'),
  };
}

export function normalizeVariantTranslation(
  input: VariantTranslationInput,
): VariantTranslationInput {
  return {
    locale: canonicalLocale(input.locale),
    name: assertBounded(input.name, 1, 160, 'name'),
  };
}

export function normalizeTaxonomyTranslation(
  input: CategoryTranslationInput,
): CategoryTranslationInput {
  return {
    locale: canonicalLocale(input.locale),
    name: assertBounded(input.name, 1, 160, 'name'),
    slug: normalizeSlug(input.slug),
    description: optionalText(input.description, 2_000, 'description'),
    metaTitle: optionalText(input.metaTitle, 70, 'metaTitle'),
    metaDescription: optionalText(input.metaDescription, 170, 'metaDescription'),
  };
}

export function assertVariantShape(
  input: Readonly<{
    sku: string;
    netWeightGrams: number;
    jarSizeLabelKey: string;
    packagingTypeKey: string;
    barcode?: string | null;
    weightGramsShipping: number;
    dimensionsMm: readonly number[];
    position: number;
  }>,
): void {
  assertBounded(input.sku, 1, 80, 'sku');
  assertBounded(input.jarSizeLabelKey, 1, 80, 'jarSizeLabelKey');
  assertBounded(input.packagingTypeKey, 1, 80, 'packagingTypeKey');
  if (
    !Number.isSafeInteger(input.netWeightGrams) ||
    input.netWeightGrams < 1 ||
    input.netWeightGrams > 100_000 ||
    !Number.isSafeInteger(input.weightGramsShipping) ||
    input.weightGramsShipping < 1 ||
    input.weightGramsShipping > 200_000 ||
    !Number.isSafeInteger(input.position) ||
    input.position < 0 ||
    input.position > 10_000 ||
    input.dimensionsMm.length !== 3 ||
    input.dimensionsMm.some(
      (dimension) => !Number.isSafeInteger(dimension) || dimension < 1 || dimension > 10_000,
    )
  ) {
    throw new TypeError('Variant measurements are invalid.');
  }
  if (
    input.barcode !== null &&
    input.barcode !== undefined &&
    !/^[0-9]{8,14}$/u.test(input.barcode)
  ) {
    throw new TypeError('Barcode is invalid.');
  }
}

export function assertPublicationCompleteness(
  input: Readonly<{
    translations: readonly Readonly<{
      locale: string;
      name: string;
      slug: string;
      storyHtml: string | null;
    }>[];
    variants: readonly Readonly<{
      id: string;
      productId: string;
      status: VariantStatus;
      isDefault: boolean;
      deletedAt: Date | null;
      translations: readonly Readonly<{ locale: string; name: string }>[];
    }>[];
    categories: readonly Readonly<{ id: string; deletedAt: Date | null }>[];
    primaryCategoryId: string | null;
    mediaAssetIds: readonly string[];
    validMediaAssetIds: ReadonlySet<string>;
  }>,
  enabledLocales: readonly string[],
): void {
  const locales = new Set(
    input.translations.map((translation) => canonicalLocale(translation.locale)),
  );
  if (!enabledLocales.every((locale) => locales.has(locale))) {
    throw new TypeError('Every enabled locale requires a complete product translation.');
  }
  for (const translation of input.translations) {
    if (translation.name.trim().length === 0 || normalizeSlug(translation.slug).length === 0) {
      throw new TypeError('Product translation is incomplete.');
    }
    if (
      translation.storyHtml !== null &&
      sanitizeStoryHtml(translation.storyHtml) !== translation.storyHtml
    ) {
      throw new TypeError('Story content is not stored in canonical sanitized form.');
    }
  }
  const publishable = input.variants.filter(
    (variant) => variant.status === 'PUBLISHED' && variant.deletedAt === null,
  );
  if (publishable.length === 0) throw new TypeError('A published variant is required.');
  for (const variant of publishable) {
    const variantLocales = new Set(
      variant.translations.map((translation) => canonicalLocale(translation.locale)),
    );
    if (!enabledLocales.every((locale) => variantLocales.has(locale))) {
      throw new TypeError('Every published variant requires every enabled locale.');
    }
  }
  const defaults = publishable.filter((variant) => variant.isDefault);
  if (defaults.length !== 1) throw new TypeError('Exactly one valid default variant is required.');
  if (input.primaryCategoryId === null) throw new TypeError('A primary category is required.');
  const primary = input.categories.find((category) => category.id === input.primaryCategoryId);
  if (primary === undefined || primary.deletedAt !== null) {
    throw new TypeError('The primary category must be an active product category.');
  }
  if (!input.mediaAssetIds.every((id) => input.validMediaAssetIds.has(id))) {
    throw new TypeError('Every attached media asset must be public and processed.');
  }
}

export function cursorFingerprint(
  value: Readonly<Record<string, string | number | undefined>>,
): string {
  const canonical = Object.entries(value)
    .filter((entry) => entry[1] !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return createHash('sha256').update(JSON.stringify(canonical)).digest('base64url').slice(0, 22);
}

export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeCursor(value: string, expectedFingerprint: string): CursorPayload {
  if (value.length < 10 || value.length > 1_024 || !/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new TypeError('Cursor is malformed.');
  }
  let candidate: unknown;
  try {
    candidate = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    throw new TypeError('Cursor is malformed.');
  }
  if (
    candidate === null ||
    typeof candidate !== 'object' ||
    !('version' in candidate) ||
    candidate.version !== 1 ||
    !('fingerprint' in candidate) ||
    candidate.fingerprint !== expectedFingerprint ||
    !('sortValue' in candidate) ||
    (typeof candidate.sortValue !== 'string' && typeof candidate.sortValue !== 'number') ||
    !('id' in candidate) ||
    typeof candidate.id !== 'string' ||
    !UUID.test(candidate.id)
  ) {
    throw new TypeError('Cursor does not match this catalog query.');
  }
  return {
    version: 1,
    fingerprint: expectedFingerprint,
    sortValue: candidate.sortValue,
    id: candidate.id,
  };
}

export function isPublicProduct(value: unknown): value is PublicProduct {
  return (
    value !== null &&
    typeof value === 'object' &&
    'id' in value &&
    typeof value.id === 'string' &&
    'slug' in value &&
    typeof value.slug === 'string' &&
    'name' in value &&
    typeof value.name === 'string' &&
    'variants' in value &&
    Array.isArray(value.variants) &&
    'media' in value &&
    Array.isArray(value.media)
  );
}

export function isPublicProductPage(value: unknown): value is PublicPage<PublicProduct> {
  return (
    value !== null &&
    typeof value === 'object' &&
    'data' in value &&
    Array.isArray(value.data) &&
    value.data.every(isPublicProduct) &&
    'page' in value &&
    value.page !== null &&
    typeof value.page === 'object' &&
    'hasMore' in value.page &&
    typeof value.page.hasMore === 'boolean'
  );
}
