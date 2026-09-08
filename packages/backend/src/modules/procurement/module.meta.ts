export const procurementModuleMeta = {
  name: 'procurement',
  tables: [
    'supplier',
    'purchase_order',
    'purchase_order_line',
    'goods_receipt',
    'goods_receipt_line',
  ],
  queues: [],
  events: ['purchase_order.confirmed', 'procurement.goods_received'],
  publicRoutes: [],
  protectedRoutes: ['/v1/admin/procurement/*'],
} as const;
