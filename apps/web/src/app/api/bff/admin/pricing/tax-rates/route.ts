import { adminRoute } from '@/lib/admin/bff';

export const GET = adminRoute({ method: 'GET', path: '/v1/admin/pricing/tax-rates' });
export const POST = adminRoute({
  method: 'POST',
  path: '/v1/admin/pricing/tax-rates',
  bodyKeys: ['code', 'rateBps', 'country', 'region', 'isInclusive', 'isActive'],
});
