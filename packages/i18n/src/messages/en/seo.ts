import type { SeoMessages } from '../types.js';

export const seo = {
  homeTitle: 'Honey from Azerbaijan',
  homeDescription:
    'Single-brand honey from the mountains of Azerbaijan — origin, craft, and tasting character.',
  productsTitle: 'Honey products',
  productsDescription: 'Browse our full catalog of bottled honeys, by origin and floral source.',
  categoriesTitle: 'Honey categories',
  categoriesDescription: 'Explore our honey range by category and floral character.',
  collectionsTitle: 'Honey collections',
  collectionsDescription: 'Curated collections of honeys we bottle under our name.',
  searchTitle: 'Search honey',
  searchDescription: 'Search our catalog of honeys by name, origin, and tasting notes.',
  organizationDescription: 'A single-brand honey house bottling mountain and floral honeys.',
} as const satisfies SeoMessages;
