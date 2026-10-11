import { adminRoute } from '@/lib/admin/bff';

export const POST = adminRoute({
  method: 'POST',
  path: (params) => `/v1/admin/media/upload-intents/${params['uploadId']}/complete`,
  params: ['uploadId'],
});
