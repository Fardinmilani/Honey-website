import type { MessageCatalog } from '../types.js';
import { accessibility } from './accessibility.js';
import { common } from './common.js';
import { errors } from './errors.js';
import { home } from './home.js';
import { navigation } from './navigation.js';

export const enCatalog = {
  common,
  navigation,
  home,
  accessibility,
  errors,
} as const satisfies MessageCatalog;
