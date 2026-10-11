import { adminRoute } from '@/lib/admin/bff';

export const GET = adminRoute({
  method: 'GET',
  path: (params) => `/v1/admin/inventory/items/${params['variantId']}/${params['stockLocationId']}`,
  params: ['variantId', 'stockLocationId'],
});
