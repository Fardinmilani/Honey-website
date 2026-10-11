import { adminRoute } from '@/lib/admin/bff';

export const GET = adminRoute({
  method: 'GET',
  path: '/v1/admin/pricing/tax-rates/page',
  query: ['cursor', 'limit'],
});
