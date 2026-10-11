import { adminRoute } from '@/lib/admin/bff';

export const PUT = adminRoute({
  method: 'PUT',
  path: (params) => `/v1/admin/catalog/products/${params['id']}/translations`,
  params: ['id'],
  bodyKeys: [
    'locale',
    'name',
    'slug',
    'shortDescription',
    'description',
    'tastingNotes',
    'pairingSuggestions',
    'storyHtml',
    'metaTitle',
    'metaDescription',
  ],
});
