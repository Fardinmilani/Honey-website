export const pricingModuleMetadata = {
  name: 'pricing',
  tables: ['variant_price', 'tax_rate', 'coupon', 'coupon_redemption'],
  queues: [],
  events: ['price.changed'],
  publicRoutes: [],
} as const;
