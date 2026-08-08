import type { HomeMessages } from '../types.js';

export const home = {
  title: 'Honey',
  headline: 'From the mountains of Azerbaijan',
  supporting: 'Single-origin honey, gathered with care and bottled under our name.',
  ctaExplore: 'Discover our honey',
  heroAriaLabel: 'Honey pouring across the jar',
} as const satisfies HomeMessages;
