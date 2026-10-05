export const shippingModuleMeta = {
  name: 'shipping',
  tables: ['shipping_zone', 'shipping_method', 'shipping_method_translation', 'shipping_rate'],
  queues: [],
  events: [],
  publicRoutes: [],
  protectedRoutes: ['/v1/admin/shipping/*'],
} as const;
