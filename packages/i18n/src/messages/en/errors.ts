import type { ErrorsMessages } from '../types.js';

export const errors = {
  notFound: 'This page could not be found.',
  unsupportedLocale: 'This language is not available.',
  generic: 'Something went wrong. Please try again.',
  upstreamUnavailable: 'We could not reach the catalog. Please try again shortly.',
} as const satisfies ErrorsMessages;
