import { adminRoute } from '@/lib/admin/bff';

export const PATCH = adminRoute({
  method: 'PATCH',
  path: (params) => `/v1/admin/catalog/products/${params['id']}/media/${params['attachmentId']}`,
  params: ['id', 'attachmentId'],
  bodyKeys: ['role', 'position', 'altTextByLocale'],
});
export const DELETE = adminRoute({
  method: 'DELETE',
  path: (params) => `/v1/admin/catalog/products/${params['id']}/media/${params['attachmentId']}`,
  params: ['id', 'attachmentId'],
});
