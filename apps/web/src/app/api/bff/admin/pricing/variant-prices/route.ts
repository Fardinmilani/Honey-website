import { adminRoute } from '@/lib/admin/bff';

export const GET = adminRoute({
  method: 'GET',
  path: '/v1/admin/pricing/variant-prices',
  query: ['variantId'],
});
export const POST = adminRoute({
  method: 'POST',
  path: '/v1/admin/pricing/variant-prices',
  bodyKeys: ['variantId', 'amountMinor', 'compareAtMinor', 'currency', 'validFrom', 'validTo'],
});
