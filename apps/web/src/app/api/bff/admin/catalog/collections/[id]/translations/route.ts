import { adminRoute } from '@/lib/admin/bff';

export const PUT = adminRoute({
  method: 'PUT',
  path: (params) => `/v1/admin/catalog/collections/${params['id']}/translations`,
  params: ['id'],
  bodyKeys: ['locale', 'name', 'slug', 'description', 'metaTitle', 'metaDescription'],
});
