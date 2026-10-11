import { adminRoute } from '@/lib/admin/bff';

export const POST = adminRoute({
  method: 'POST',
  path: (params) =>
    `/v1/admin/catalog/products/${params['id']}/variants/${params['variantId']}/archive`,
  params: ['id', 'variantId'],
});
