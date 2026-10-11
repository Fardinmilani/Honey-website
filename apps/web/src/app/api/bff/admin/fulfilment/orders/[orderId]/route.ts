import { adminRoute } from '@/lib/admin/bff';

export const GET = adminRoute({
  method: 'GET',
  path: (params) => `/v1/admin/fulfilment/orders/${params['orderId']}`,
  params: ['orderId'],
});
