import { adminRoute } from '@/lib/admin/bff';

export const GET = adminRoute({
  method: 'GET',
  path: '/v1/admin/pricing/coupons/page',
  query: ['cursor', 'limit', 'status'],
});
