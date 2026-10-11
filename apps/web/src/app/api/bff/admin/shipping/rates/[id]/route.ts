import { adminRoute } from '@/lib/admin/bff';

export const PUT = adminRoute({
  method: 'PUT',
  path: (params) => `/v1/admin/shipping/rates/${params['id']}`,
  params: ['id'],
  bodyKeys: [
    'methodId',
    'currency',
    'baseMinor',
    'perKgMinor',
    'freeOverSubtotalMinor',
    'minWeightGrams',
    'maxWeightGrams',
    'validFrom',
    'validTo',
  ],
});
