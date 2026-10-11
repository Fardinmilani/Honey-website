import { adminRoute } from '@/lib/admin/bff';

export const POST = adminRoute({
  method: 'POST',
  path: (params) => `/v1/admin/fulfilment/shipments/${params['shipmentId']}/deliver`,
  params: ['shipmentId'],
});
