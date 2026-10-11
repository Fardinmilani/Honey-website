import { adminRoute } from '@/lib/admin/bff';
export const PUT = adminRoute({
  method: 'PUT',
  params: ['id'],
  path: (p) => `/v1/admin/content/page/${p['id']}/translations`,
  bodyKeys: ['locale', 'title', 'slug', 'blocks', 'metaTitle', 'metaDescription'],
});
