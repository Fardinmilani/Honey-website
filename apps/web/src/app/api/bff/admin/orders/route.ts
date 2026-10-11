import { adminRoute } from '@/lib/admin/bff';

export const GET = adminRoute({
  method: 'GET',
  path: '/v1/admin/orders',
  query: ['cursor', 'limit', 'q', 'status', 'paymentStatus', 'fulfilmentStatus', 'customerId'],
});
