export const cartModuleMetadata = {
  name: 'cart',
  tables: ['cart', 'cart_line'],
  queues: [],
  events: [],
  publicRoutes: ['GET /v1/cart', 'POST /v1/cart/lines'],
} as const;
