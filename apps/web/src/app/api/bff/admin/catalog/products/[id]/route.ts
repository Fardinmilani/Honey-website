import { adminRoute } from '@/lib/admin/bff';

export const GET = adminRoute({
  method: 'GET',
  path: (params) => `/v1/admin/catalog/products/${params['id']}`,
  params: ['id'],
});
export const PUT = adminRoute({
  method: 'PUT',
  path: (params) => `/v1/admin/catalog/products/${params['id']}`,
  params: ['id'],
  bodyKeys: [
    'sku',
    'brandLine',
    'honeyVarietal',
    'floralSources',
    'originRegion',
    'originAltitudeBand',
    'harvestSeason',
    'sourcingType',
    'apiaryId',
    'sortWeight',
  ],
});
