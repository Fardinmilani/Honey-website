import { adminRoute } from '@/lib/admin/bff';

export const GET = adminRoute({
  method: 'GET',
  path: '/v1/admin/pricing/variant-prices/page',
  query: ['cursor', 'limit', 'variantId'],
});
