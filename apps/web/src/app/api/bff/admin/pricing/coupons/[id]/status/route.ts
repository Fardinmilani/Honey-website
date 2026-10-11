import { adminRoute } from '@/lib/admin/bff';

export const PATCH = adminRoute({
  method: 'PATCH',
  path: (params) => `/v1/admin/pricing/coupons/${params['id']}/status`,
  params: ['id'],
  bodyKeys: ['status', 'expectedStatus'],
});
