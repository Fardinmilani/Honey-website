import { adminRoute } from '@/lib/admin/bff';

export const DELETE = adminRoute({
  method: 'DELETE',
  path: (params) => `/v1/admin/catalog/products/${params['id']}/categories/${params['relationId']}`,
  params: ['id', 'relationId'],
});
