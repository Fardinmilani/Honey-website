import { adminRoute } from '@/lib/admin/bff';

export const DELETE = adminRoute({
  method: 'DELETE',
  path: (params) =>
    `/v1/admin/catalog/products/${params['id']}/collections/${params['relationId']}`,
  params: ['id', 'relationId'],
});
