import { adminRoute } from '@/lib/admin/bff';

export const PUT = adminRoute({
  method: 'PUT',
  path: (params) => `/v1/admin/shipping/methods/${params['id']}`,
  params: ['id'],
  bodyKeys: ['code', 'zoneId', 'isActive', 'sortOrder', 'translations'],
});
