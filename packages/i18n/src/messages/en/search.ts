import type { SearchMessages } from '../types.js';

export const search = {
  title: 'Search',
  heading: 'Search our honey',
  description: 'Find honeys by name, origin, or tasting character.',
  label: 'Search',
  placeholder: 'Try wildflower or mountain',
  submit: 'Search',
  resultsHeading: 'Results for “{query}”',
  noResults: 'No honeys matched “{query}”.',
  emptyQuery: 'Enter a search to begin.',
  sortRelevance: 'Relevance',
  sortNewest: 'Newest',
  sortName: 'Name',
} as const satisfies SearchMessages;
