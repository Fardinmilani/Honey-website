import type { AccessibilityMessages } from '../types.js';

export const accessibility = {
  languageSwitcher: 'تغییر زبان',
  currentLanguage: 'زبان فعلی: {language}',
  skipToContent: 'پرش به محتوا',
} as const satisfies AccessibilityMessages;
