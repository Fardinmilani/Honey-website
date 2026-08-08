import type { AccessibilityMessages } from '../types.js';

export const accessibility = {
  languageSwitcher: 'Language switcher',
  currentLanguage: 'Current language: {language}',
  skipToContent: 'Skip to content',
} as const satisfies AccessibilityMessages;
