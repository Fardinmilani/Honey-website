export const identityModuleMetadata = {
  name: 'identity',
  tables: [
    'user',
    'auth_credential',
    'session',
    'verification_token',
    'role',
    'permission',
    'role_permission',
    'user_role',
    'audit_log',
  ],
  queues: [],
  events: [],
  publicRoutes: ['/v1/auth/*', '/v1/me', '/v1/me/sessions'],
} as const;
