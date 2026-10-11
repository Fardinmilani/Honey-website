import { adminRoute } from '@/lib/admin/bff';

export const POST = adminRoute({
  method: 'POST',
  path: (params) => `/v1/admin/fulfilment/orders/${params['orderId']}/cancel`,
  params: ['orderId'],
});
