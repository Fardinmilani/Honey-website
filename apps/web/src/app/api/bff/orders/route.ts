import { proxyCheckoutRequest } from '../checkout/_proxy';

export async function GET(request: Request) {
  return proxyCheckoutRequest(request, { path: '/v1/orders', method: 'GET' });
}
