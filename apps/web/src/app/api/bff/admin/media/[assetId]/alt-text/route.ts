import { adminRoute } from '@/lib/admin/bff';

export const PATCH = adminRoute({
  method: 'PATCH',
  path: (params) => `/v1/admin/media/${params['assetId']}/alt-text`,
  params: ['assetId'],
  bodyKeys: ['altTextByLocale'],
});
