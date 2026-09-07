import type { NavigationMessages } from '../types.js';

export const navigation = {
  home: 'خانه',
  products: 'محصولات',
  categories: 'دسته‌ها',
  collections: 'مجموعه‌ها',
  search: 'جستجو',
  primaryNavLabel: 'ناوبری اصلی',
  footerNavLabel: 'ناوبری پاورقی',
} as const satisfies NavigationMessages;
