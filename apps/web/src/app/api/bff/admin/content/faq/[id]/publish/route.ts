import { adminRoute } from '@/lib/admin/bff';
export const POST = adminRoute({
  method: 'POST',
  params: ['id'],
  path: (p) => `/v1/admin/content/faq/${p['id']}/publish`,
  bodyKeys: [],
});
