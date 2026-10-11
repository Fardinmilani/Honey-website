import { adminRoute } from '@/lib/admin/bff';

export const GET = adminRoute({
  method: 'GET',
  path: '/v1/admin/sourcing/harvest-batches',
  query: ['cursor', 'limit'],
});
export const POST = adminRoute({
  method: 'POST',
  path: '/v1/admin/sourcing/harvest-batches',
  bodyKeys: [
    'batchCode',
    'sourcingType',
    'apiaryId',
    'supplierId',
    'harvestSeason',
    'harvestYear',
    'floralSources',
    'receivedAt',
    'quantityGrams',
    'notes',
  ],
});
