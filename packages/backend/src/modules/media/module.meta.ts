export const mediaModuleMetadata = {
  name: 'media',
  tables: ['media_asset', 'media_derivative'],
  queues: [],
  events: [],
  protectedRoutes: ['/v1/admin/media/*'],
} as const;
