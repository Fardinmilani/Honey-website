export const catalogModuleMeta = {
  name: 'catalog',
  owns: [
    'product',
    'product_translation',
    'product_variant',
    'variant_translation',
    'category',
    'category_translation',
    'collection',
    'collection_translation',
    'product_category',
    'product_collection',
    'product_media',
    'slug_history',
  ],
  permissions: ['catalog:read', 'catalog:write', 'catalog:publish'],
} as const;
