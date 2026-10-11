import { adminRoute } from '@/lib/admin/bff';

export const PATCH = adminRoute({
  method: 'PATCH',
  path: (params) => `/v1/admin/inventory/locations/${params['id']}`,
  params: ['id'],
  bodyKeys: ['code', 'name', 'type', 'isSellable', 'isDefault'],
});
