import type { NavigationMessages } from '../types.js';

export const navigation = {
  home: 'Home',
  products: 'Products',
  categories: 'Categories',
  collections: 'Collections',
  search: 'Search',
  cart: 'Cart',
  cartItemCount: 'Cart, {count} items',
  primaryNavLabel: 'Primary',
  footerNavLabel: 'Footer',
} as const satisfies NavigationMessages;
