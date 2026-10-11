import { adminRoute } from '@/lib/admin/bff';

export const GET = adminRoute({
  method: 'GET',
  path: (params) => `/v1/admin/media/${params['assetId']}`,
  params: ['assetId'],
});
export const DELETE = adminRoute({
  method: 'DELETE',
  path: (params) => `/v1/admin/media/${params['assetId']}`,
  params: ['assetId'],
});
