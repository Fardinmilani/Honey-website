import { adminRoute } from '@/lib/admin/bff';

export const GET = adminRoute({
  method: 'GET',
  path: '/v1/admin/procurement/purchase-orders',
  query: ['cursor', 'limit', 'status', 'supplierId'],
});
export const POST = adminRoute({
  method: 'POST',
  path: '/v1/admin/procurement/purchase-orders',
  bodyKeys: [
    'number',
    'supplierId',
    'currency',
    'expectedAt',
    'notes',
    'destinationStockLocationId',
    'freightCostMinor',
    'dutyCostMinor',
    'otherCostMinor',
    'lines',
  ],
});
