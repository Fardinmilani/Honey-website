import { adminRoute } from '@/lib/admin/bff';

export const PUT = adminRoute({
  method: 'PUT',
  path: (params) => `/v1/admin/catalog/categories/${params['id']}`,
  params: ['id'],
  bodyKeys: ['sortWeight'],
});
