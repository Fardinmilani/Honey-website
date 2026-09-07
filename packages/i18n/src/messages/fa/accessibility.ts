import type { AccessibilityMessages } from '../types.js';

export const accessibility = {
  languageSwitcher: 'تغییر زبان',
  currentLanguage: 'زبان فعلی: {language}',
  skipToContent: 'رفتن به محتوا',
  breadcrumbNav: 'مسیر صفحه',
  galleryThumbnails: 'تصاویر بندانگشتی گالری',
  paginationNav: 'صفحه‌بندی',
} as const satisfies AccessibilityMessages;
