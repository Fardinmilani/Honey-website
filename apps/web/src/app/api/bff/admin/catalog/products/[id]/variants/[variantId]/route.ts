import { adminRoute } from '@/lib/admin/bff';

export const PUT = adminRoute({
  method: 'PUT',
  path: (params) => `/v1/admin/catalog/products/${params['id']}/variants/${params['variantId']}`,
  params: ['id', 'variantId'],
  bodyKeys: [
    'sku',
    'netWeightGrams',
    'jarSizeLabelKey',
    'packagingTypeKey',
    'barcode',
    'weightGramsShipping',
    'dimensionsMm',
    'position',
  ],
});
