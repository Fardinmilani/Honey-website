import { invalidRequest, parseApplyCoupon, proxyCartRequest } from '../_proxy';

export async function POST(request: Request) {
  const body = await parseApplyCoupon(request);
  if (body === null) return invalidRequest();
  return proxyCartRequest(request, { path: '/v1/cart/coupon', method: 'POST', body });
}

export async function DELETE(request: Request) {
  return proxyCartRequest(request, { path: '/v1/cart/coupon', method: 'DELETE' });
}
