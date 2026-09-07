import type { SearchMessages } from '../types.js';

export const search = {
  title: 'جستجو',
  heading: 'جستجوی عسل',
  description: 'عسل را با نام، خاستگاه یا ویژگی چشایی بیابید.',
  label: 'جستجو',
  placeholder: 'مثلاً کوهستان یا کنار',
  submit: 'جستجو',
  resultsHeading: 'نتایج برای «{query}»',
  noResults: 'عسلی با «{query}» یافت نشد.',
  emptyQuery: 'برای شروع عبارتی وارد کنید.',
  sortRelevance: 'مرتبط‌ترین',
  sortNewest: 'جدیدترین',
  sortName: 'نام',
} as const satisfies SearchMessages;
