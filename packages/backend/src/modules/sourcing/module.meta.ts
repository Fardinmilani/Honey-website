export const sourcingModuleMeta = {
  name: 'sourcing',
  tables: ['apiary', 'apiary_translation', 'harvest_batch', 'batch_allocation'],
  queues: [],
  events: [],
  publicRoutes: [],
  protectedRoutes: ['/v1/admin/sourcing/*'],
} as const;
