import { adminRoute } from '@/lib/admin/bff';

export const POST = adminRoute({
  method: 'POST',
  path: '/v1/auth/login',
  bodyKeys: ['email', 'password'],
  auth: 'login',
});
