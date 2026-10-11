import { adminRoute } from '@/lib/admin/bff';
export const GET = adminRoute({
  method: 'GET',
  path: (params) => `/v1/admin/payments/orders/${params['id']}`,
  params: ['id'],
  query: ['cursor', 'limit'],
});
