import { adminRoute } from '@/lib/admin/bff';

export const GET = adminRoute({
  method: 'GET',
  path: '/v1/admin/catalog/categories',
  query: ['cursor', 'limit', 'id'],
});
export const POST = adminRoute({
  method: 'POST',
  path: '/v1/admin/catalog/categories',
  bodyKeys: ['parentId', 'sortWeight'],
});
