import { adminRoute } from '@/lib/admin/bff';

export const GET = adminRoute({
  method: 'GET',
  path: '/v1/admin/procurement/suppliers',
  query: ['cursor', 'limit', 'status'],
});
export const POST = adminRoute({
  method: 'POST',
  path: '/v1/admin/procurement/suppliers',
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
