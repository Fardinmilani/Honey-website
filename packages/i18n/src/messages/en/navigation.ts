import type { NavigationMessages } from '../types.js';

export const navigation = {
  home: 'Home',
  primaryNavLabel: 'Primary',
  footerNavLabel: 'Footer',
} as const satisfies NavigationMessages;
