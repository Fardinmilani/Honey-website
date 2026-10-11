import { adminRoute } from '@/lib/admin/bff';

export const PUT = adminRoute({
  method: 'PUT',
  path: (params) =>
    `/v1/admin/catalog/products/${params['id']}/variants/${params['variantId']}/translations`,
  params: ['id', 'variantId'],
  bodyKeys: ['locale', 'name'],
});
