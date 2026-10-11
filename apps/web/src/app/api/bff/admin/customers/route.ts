import { adminRoute } from '@/lib/admin/bff';

export const GET = adminRoute({
  method: 'GET',
  path: '/v1/admin/customers',
  query: ['cursor', 'limit', 'q'],
});
