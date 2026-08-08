import type { ErrorsMessages } from '../types.js';

export const errors = {
  notFound: 'This page could not be found.',
  unsupportedLocale: 'This language is not available.',
  generic: 'Something went wrong. Please try again.',
} as const satisfies ErrorsMessages;
