import { adminRoute } from '@/lib/admin/bff';

export const POST = adminRoute({
  method: 'POST',
  path: (params) => `/v1/admin/payments/${params['paymentId']}/refund-requests`,
  params: ['paymentId'],
  bodyKeys: ['amountMinor', 'reason'],
  idempotent: true,
});
