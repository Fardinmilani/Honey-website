import { adminRoute } from '@/lib/admin/bff';

export const GET = adminRoute({ method: 'GET', path: '/v1/admin/inventory/locations' });
export const POST = adminRoute({
  method: 'POST',
  path: '/v1/admin/inventory/locations',
  bodyKeys: ['code', 'name', 'type', 'isSellable', 'isDefault'],
});
