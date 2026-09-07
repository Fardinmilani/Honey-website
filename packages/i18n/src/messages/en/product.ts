import type { ProductMessages } from '../types.js';

export const product = {
  tastingNotes: 'Tasting notes',
  pairingSuggestions: 'Pairing suggestions',
  floralSources: 'Floral sources',
  originRegion: 'Origin',
  originAltitude: 'Altitude band',
  harvestSeason: 'Harvest season',
  honeyVarietal: 'Varietal',
  story: 'Our story',
  variants: 'Jar sizes',
  packaging: 'Packaging',
  galleryLabel: 'Product images',
  mainImage: 'Main product image',
} as const satisfies ProductMessages;
