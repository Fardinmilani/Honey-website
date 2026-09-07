import type { MessageCatalog } from '../types.js';
import { accessibility } from './accessibility.js';
import { catalog } from './catalog.js';
import { common } from './common.js';
import { errors } from './errors.js';
import { home } from './home.js';
import { navigation } from './navigation.js';
import { product } from './product.js';
import { search } from './search.js';
import { seo } from './seo.js';

export const faCatalog = {
  common,
  navigation,
  home,
  accessibility,
  errors,
  catalog,
  product,
  search,
  seo,
} as const satisfies MessageCatalog;
