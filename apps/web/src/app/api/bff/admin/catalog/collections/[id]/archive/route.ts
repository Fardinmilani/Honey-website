import { adminRoute } from '@/lib/admin/bff';

export const POST = adminRoute({
  method: 'POST',
  path: (params) => `/v1/admin/catalog/collections/${params['id']}/archive`,
  params: ['id'],
});
