import { adminRoute } from '@/lib/admin/bff';

export const GET = adminRoute({
  method: 'GET',
  path: '/v1/admin/catalog/products',
  query: ['cursor', 'limit', 'q', 'status'],
});
export const POST = adminRoute({
  method: 'POST',
  path: '/v1/admin/catalog/products',
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
