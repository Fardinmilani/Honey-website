import { adminRoute } from '@/lib/admin/bff';

export const GET = adminRoute({
  method: 'GET',
  path: (params) => `/v1/admin/orders/${params['id']}/notes`,
  params: ['id'],
  query: ['cursor', 'limit'],
});
export const POST = adminRoute({
  method: 'POST',
  path: (params) => `/v1/admin/orders/${params['id']}/notes`,
  params: ['id'],
  bodyKeys: ['body'],
});
