import { adminRoute } from '@/lib/admin/bff';

export const GET = adminRoute({
  method: 'GET',
  path: '/v1/admin/media',
  query: ['cursor', 'limit', 'kind', 'visibility', 'assetId'],
});
