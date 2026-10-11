export const reviewsModuleMeta = {
  name: 'reviews',
  owns: ['product_review'],
  permissions: ['review:moderate'],
} as const;
