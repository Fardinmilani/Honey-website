import { adminRoute } from '@/lib/admin/bff';

export const POST = adminRoute({
  method: 'POST',
  path: (params) => `/v1/admin/media/${params['assetId']}/private-url`,
  params: ['assetId'],
});
