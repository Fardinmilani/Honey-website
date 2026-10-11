import { adminRoute } from '@/lib/admin/bff';

export const POST = adminRoute({
  method: 'POST',
  path: (params) => `/v1/admin/procurement/purchase-orders/${params['id']}/lines`,
  params: ['id'],
  bodyKeys: ['lines'],
});
