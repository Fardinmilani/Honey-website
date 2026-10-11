import { adminRoute } from '@/lib/admin/bff';

export const POST = adminRoute({
  method: 'POST',
  path: (params) => `/v1/admin/fulfilment/orders/${params['orderId']}/shipments`,
  params: ['orderId'],
  bodyKeys: ['lines', 'trackingNumber'],
  idempotent: true,
});
