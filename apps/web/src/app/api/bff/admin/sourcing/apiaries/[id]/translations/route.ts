import { adminRoute } from '@/lib/admin/bff';

export const POST = adminRoute({
  method: 'POST',
  path: (params) => `/v1/admin/sourcing/apiaries/${params['id']}/translations`,
  params: ['id'],
  bodyKeys: ['locale', 'name', 'description'],
});
