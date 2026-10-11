import { adminRoute } from '@/lib/admin/bff';

export const PUT = adminRoute({
  method: 'PUT',
  path: (params) => `/v1/admin/catalog/collections/${params['id']}`,
  params: ['id'],
  bodyKeys: ['sortWeight'],
});
