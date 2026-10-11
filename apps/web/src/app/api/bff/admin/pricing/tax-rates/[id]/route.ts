import { adminRoute } from '@/lib/admin/bff';

export const PUT = adminRoute({
  method: 'PUT',
  path: (params) => `/v1/admin/pricing/tax-rates/${params['id']}`,
  params: ['id'],
  bodyKeys: ['code', 'rateBps', 'country', 'region', 'isInclusive', 'isActive'],
});
