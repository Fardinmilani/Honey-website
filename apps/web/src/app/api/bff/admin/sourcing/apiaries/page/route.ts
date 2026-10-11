import { adminRoute } from '@/lib/admin/bff';
export const GET = adminRoute({
  method: 'GET',
  path: '/v1/admin/sourcing/apiaries/page',
  query: ['cursor', 'limit'],
});
