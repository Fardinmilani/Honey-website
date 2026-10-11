import { adminRoute } from '@/lib/admin/bff';

export const GET = adminRoute({ method: 'GET', path: '/v1/admin/sourcing/apiaries' });
export const POST = adminRoute({
  method: 'POST',
  path: '/v1/admin/sourcing/apiaries',
  bodyKeys: ['code', 'name', 'region', 'altitudeBand', 'notes', 'isOwnOperation'],
});
