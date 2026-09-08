export const inventoryModuleMeta = {
  name: 'inventory',
  tables: ['stock_location', 'inventory_item', 'stock_ledger_entry', 'stock_reservation'],
  queues: ['inventory'],
  events: [
    'inventory.changed',
    'inventory.oversell_prevented',
    'stock.low',
    'inventory.reconciled',
  ],
  publicRoutes: [],
  protectedRoutes: ['/v1/admin/inventory/*'],
} as const;
