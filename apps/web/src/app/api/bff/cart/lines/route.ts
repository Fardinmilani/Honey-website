import { invalidRequest, parseAddCartLine, parseIdempotencyKey, proxyCartRequest } from '../_proxy';

export async function POST(request: Request) {
  const body = await parseAddCartLine(request);
  const idempotencyKey = parseIdempotencyKey(request);
  if (body === null || idempotencyKey === null) return invalidRequest();
  return proxyCartRequest(request, {
    path: '/v1/cart/lines',
    method: 'POST',
    body,
    idempotencyKey,
  });
}
