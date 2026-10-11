import { adminRoute } from '@/lib/admin/bff';

export const POST = adminRoute({
  method: 'POST',
  path: '/v1/admin/sourcing/production-intake',
  bodyKeys: ['allocationId', 'stockLocationId', 'quantity', 'note'],
});
