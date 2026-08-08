import type { NavigationMessages } from '../types.js';

export const navigation = {
  home: 'خانه',
  primaryNavLabel: 'ناوبری اصلی',
  footerNavLabel: 'ناوبری پاورقی',
} as const satisfies NavigationMessages;
