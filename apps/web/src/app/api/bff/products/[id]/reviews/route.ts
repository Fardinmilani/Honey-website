import { adminRoute } from '@/lib/admin/bff';
export const GET = adminRoute({
  method: 'GET',
  params: ['id'],
  path: (p) => `/v1/products/${p['id']}/reviews`,
  query: ['cursor', 'limit'],
});
