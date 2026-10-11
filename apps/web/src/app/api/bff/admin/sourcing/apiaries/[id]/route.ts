import { adminRoute } from '@/lib/admin/bff';

export const GET = adminRoute({
  method: 'GET',
  path: (params) => `/v1/admin/sourcing/apiaries/${params['id']}`,
  params: ['id'],
});
export const PATCH = adminRoute({
  method: 'PATCH',
  path: (params) => `/v1/admin/sourcing/apiaries/${params['id']}`,
  params: ['id'],
  bodyKeys: ['code', 'name', 'region', 'altitudeBand', 'notes', 'isOwnOperation'],
});
