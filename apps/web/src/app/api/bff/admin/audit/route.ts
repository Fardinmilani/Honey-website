import { adminRoute } from '@/lib/admin/bff';

export const GET = adminRoute({
  method: 'GET',
  path: '/v1/admin/audit',
  query: ['cursor', 'limit', 'actorUserId', 'action', 'subjectType', 'subjectId', 'from', 'to'],
});
