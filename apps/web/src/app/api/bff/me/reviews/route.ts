import { adminRoute } from '@/lib/admin/bff';
export const POST = adminRoute({
  method: 'POST',
  path: '/v1/me/reviews',
  bodyKeys: ['productId', 'orderId', 'rating', 'title', 'body', 'locale'],
});
