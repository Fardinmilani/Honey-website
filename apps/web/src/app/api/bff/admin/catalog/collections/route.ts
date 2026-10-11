import { adminRoute } from '@/lib/admin/bff';

export const GET = adminRoute({
  method: 'GET',
  path: '/v1/admin/catalog/collections',
  query: ['cursor', 'limit', 'id'],
});
export const POST = adminRoute({
  method: 'POST',
  path: '/v1/admin/catalog/collections',
  bodyKeys: ['sortWeight'],
});
