import { adminRoute } from '@/lib/admin/bff';

export const GET = adminRoute({
  method: 'GET',
  path: (params) => `/v1/admin/procurement/suppliers/${params['id']}`,
  params: ['id'],
});
export const PATCH = adminRoute({
  method: 'PATCH',
  path: (params) => `/v1/admin/procurement/suppliers/${params['id']}`,
  params: ['id'],
  bodyKeys: [
    'code',
    'legalName',
    'contactName',
    'email',
    'phone',
    'address',
    'status',
    'qualityRating',
    'notes',
  ],
});
