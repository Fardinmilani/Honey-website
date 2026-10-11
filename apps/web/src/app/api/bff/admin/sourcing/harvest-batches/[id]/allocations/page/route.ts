import { adminRoute } from '@/lib/admin/bff';
export const GET = adminRoute({
  method: 'GET',
  path: (params) => `/v1/admin/sourcing/harvest-batches/${params['id']}/allocations/page`,
  params: ['id'],
  query: ['cursor', 'limit'],
});
