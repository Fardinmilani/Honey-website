import type { NavigationMessages } from '../types.js';

export const navigation = {
  home: 'Home',
  products: 'Products',
  categories: 'Categories',
  collections: 'Collections',
  search: 'Search',
  primaryNavLabel: 'Primary',
  footerNavLabel: 'Footer',
} as const satisfies NavigationMessages;
