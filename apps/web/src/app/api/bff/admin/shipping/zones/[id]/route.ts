import { adminRoute } from '@/lib/admin/bff';

export const PUT = adminRoute({
  method: 'PUT',
  path: (params) => `/v1/admin/shipping/zones/${params['id']}`,
  params: ['id'],
  bodyKeys: ['name', 'countries', 'provinces', 'priority'],
});
