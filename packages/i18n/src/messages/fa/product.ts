import type { ProductMessages } from '../types.js';

export const product = {
  tastingNotes: 'یادداشت چشایی',
  pairingSuggestions: 'پیشنهاد همراهی',
  floralSources: 'منابع گل',
  originRegion: 'خاستگاه',
  originAltitude: 'نوار ارتفاع',
  harvestSeason: 'فصل برداشت',
  honeyVarietal: 'رقم',
  story: 'داستان ما',
  variants: 'اندازه شیشه',
  packaging: 'بسته‌بندی',
  galleryLabel: 'تصاویر محصول',
  mainImage: 'تصویر اصلی محصول',
  availabilityAvailable: 'موجود',
  availabilityLimited: 'موجودی محدود',
  availabilityUnavailable: 'فعلاً ناموجود',
} as const satisfies ProductMessages;
