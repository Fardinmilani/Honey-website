import { adminRoute } from '@/lib/admin/bff';

export const GET = adminRoute({ method: 'GET', path: '/v1/me', bodyKeys: [] });
