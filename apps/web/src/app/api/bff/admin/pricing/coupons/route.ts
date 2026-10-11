import { adminRoute } from '@/lib/admin/bff';

export const GET = adminRoute({ method: 'GET', path: '/v1/admin/pricing/coupons' });
export const POST = adminRoute({
  method: 'POST',
  path: '/v1/admin/pricing/coupons',
  bodyKeys: [
    'code',
    'type',
    'value',
    'currency',
    'minSubtotalMinor',
    'maxDiscountMinor',
    'startsAt',
    'endsAt',
    'usageLimitTotal',
    'usageLimitPerUser',
    'appliesTo',
    'targetIds',
    'status',
  ],
});
