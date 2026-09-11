import { proxyCartRequest } from './_proxy';

export async function GET(request: Request) {
  return proxyCartRequest(request, { path: '/v1/cart', method: 'GET' });
}
