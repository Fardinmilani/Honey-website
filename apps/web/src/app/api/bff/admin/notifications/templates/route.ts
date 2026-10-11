import { adminRoute } from '@/lib/admin/bff';
export const PUT = adminRoute({
  method: 'PUT',
  path: '/v1/admin/notifications/templates',
  bodyKeys: ['code', 'locale', 'channel', 'subject', 'body'],
});
