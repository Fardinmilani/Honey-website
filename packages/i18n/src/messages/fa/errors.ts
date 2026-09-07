import type { ErrorsMessages } from '../types.js';

export const errors = {
  notFound: 'این صفحه پیدا نشد.',
  unsupportedLocale: 'این زبان در دسترس نیست.',
  generic: 'مشکلی پیش آمد. لطفاً دوباره تلاش کنید.',
  upstreamUnavailable: 'دسترسی به کاتالوگ ممکن نشد. کمی بعد دوباره تلاش کنید.',
} as const satisfies ErrorsMessages;
