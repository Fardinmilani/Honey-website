import type { AccessibilityMessages } from '../types.js';

export const accessibility = {
  languageSwitcher: 'Language switcher',
  currentLanguage: 'Current language: {language}',
  skipToContent: 'Skip to content',
  breadcrumbNav: 'Breadcrumb',
  galleryThumbnails: 'Gallery thumbnails',
  paginationNav: 'Pagination',
} as const satisfies AccessibilityMessages;
