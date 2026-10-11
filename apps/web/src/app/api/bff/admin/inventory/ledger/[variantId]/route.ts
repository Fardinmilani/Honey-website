import { adminRoute } from '@/lib/admin/bff';

export const GET = adminRoute({
  method: 'GET',
  path: (params) => `/v1/admin/inventory/ledger/${params['variantId']}`,
  params: ['variantId'],
  query: ['cursor', 'limit'],
});
