import type { HomeMessages } from '../types.js';

export const home = {
  title: 'Honey',
  headline: 'From the mountains of Azerbaijan',
  supporting: 'Single-origin honey, gathered with care and bottled under our name.',
  ctaExplore: 'Discover our honey',
  heroAriaLabel: 'Honey pouring across the jar',
  featuredProductsHeading: 'From our jars',
  featuredCollectionsHeading: 'Featured collection',
  categoriesHeading: 'Explore by category',
  browseAllProducts: 'Browse all products',
  emptyCatalog: 'Our catalog is being prepared.',
  unavailableCatalog: 'The catalog is temporarily unavailable. Please try again shortly.',
} as const satisfies HomeMessages;
