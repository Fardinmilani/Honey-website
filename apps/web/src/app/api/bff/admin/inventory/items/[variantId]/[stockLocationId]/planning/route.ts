import { adminRoute } from '@/lib/admin/bff';

export const PATCH = adminRoute({
  method: 'PATCH',
  path: (params) =>
    `/v1/admin/inventory/items/${params['variantId']}/${params['stockLocationId']}/planning`,
  params: ['variantId', 'stockLocationId'],
  bodyKeys: ['reorderPoint', 'safetyStock'],
});
