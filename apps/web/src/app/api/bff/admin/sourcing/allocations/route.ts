import { adminRoute } from '@/lib/admin/bff';

export const POST = adminRoute({
  method: 'POST',
  path: '/v1/admin/sourcing/allocations',
  bodyKeys: ['harvestBatchId', 'variantId', 'quantityUnits', 'packedAt', 'notes'],
});
