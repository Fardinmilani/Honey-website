/**
 * Next.js data-cache tags for public catalog reads.
 * Keep cardinality bounded — prefer entity ids/slugs already in the page context.
 */
export const catalogTags = {
  catalog: 'catalog',
  products: 'catalog:products',
  categories: 'catalog:categories',
  collections: 'catalog:collections',
  locale: (locale: string) => `locale:${locale}`,
  product: (id: string) => `product:${id}`,
  productSlug: (slug: string) => `product-slug:${slug}`,
  category: (id: string) => `category:${id}`,
  categorySlug: (slug: string) => `category-slug:${slug}`,
  collection: (id: string) => `collection:${id}`,
  collectionSlug: (slug: string) => `collection-slug:${slug}`,
} as const;

export const ALLOWED_REVALIDATE_SCOPES = [
  'catalog',
  'products',
  'categories',
  'collections',
  'product',
  'category',
  'collection',
] as const;

export type RevalidateScope = (typeof ALLOWED_REVALIDATE_SCOPES)[number];

export function isRevalidateScope(value: string): value is RevalidateScope {
  return (ALLOWED_REVALIDATE_SCOPES as readonly string[]).includes(value);
}

/**
 * Maps an allow-listed invalidation request to concrete cache tags.
 * Never accepts arbitrary client-supplied tag strings.
 */
export function resolveRevalidateTags(input: {
  readonly scope: RevalidateScope;
  readonly id?: string;
  readonly slug?: string;
  readonly locale?: string;
}): string[] {
  const tags = new Set<string>([catalogTags.catalog]);
  switch (input.scope) {
    case 'catalog':
      tags.add(catalogTags.products);
      tags.add(catalogTags.categories);
      tags.add(catalogTags.collections);
      break;
    case 'products':
      tags.add(catalogTags.products);
      break;
    case 'categories':
      tags.add(catalogTags.categories);
      break;
    case 'collections':
      tags.add(catalogTags.collections);
      break;
    case 'product':
      tags.add(catalogTags.products);
      if (input.id) tags.add(catalogTags.product(input.id));
      if (input.slug) tags.add(catalogTags.productSlug(input.slug));
      break;
    case 'category':
      tags.add(catalogTags.categories);
      if (input.id) tags.add(catalogTags.category(input.id));
      if (input.slug) tags.add(catalogTags.categorySlug(input.slug));
      break;
    case 'collection':
      tags.add(catalogTags.collections);
      if (input.id) tags.add(catalogTags.collection(input.id));
      if (input.slug) tags.add(catalogTags.collectionSlug(input.slug));
      break;
    default: {
      const _exhaustive: never = input.scope;
      return _exhaustive;
    }
  }
  if (input.locale) {
    tags.add(catalogTags.locale(input.locale));
  }
  return [...tags];
}
