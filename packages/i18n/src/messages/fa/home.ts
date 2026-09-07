import type { HomeMessages } from '../types.js';

export const home = {
  title: 'عسل',
  headline: 'از کوه‌های آذربایجان',
  supporting: 'عسل تک‌خاستگاه، با وسواس گردآوری و به نام خودمان بسته‌بندی می‌شود.',
  ctaExplore: 'عسل ما را کشف کنید',
  heroAriaLabel: 'پویانمایی ریختن عسل در شیشه',
  featuredProductsHeading: 'از شیشه‌های ما',
  featuredCollectionsHeading: 'مجموعه ویژه',
  categoriesHeading: 'کاوش بر اساس دسته',
  browseAllProducts: 'همه محصولات',
  emptyCatalog: 'کاتالوگ در حال آماده‌سازی است.',
  unavailableCatalog: 'کاتالوگ موقتاً در دسترس نیست. کمی بعد دوباره تلاش کنید.',
} as const satisfies HomeMessages;
