import { adminRoute } from '@/lib/admin/bff';

export const GET = adminRoute({
  method: 'GET',
  path: (params) => `/v1/admin/procurement/purchase-orders/${params['id']}/landed-cost`,
  params: ['id'],
});
