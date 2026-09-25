import { invalidRequest, parseIdempotencyKey, parseStartCheckout, proxyCheckoutRequest } from './_proxy';

export async function POST(request: Request) {
  const body = await parseStartCheckout(request);
  const idempotencyKey = parseIdempotencyKey(request);
  if (body === null || idempotencyKey === null) return invalidRequest();
  return proxyCheckoutRequest(request, {
    path: '/v1/checkout',
    method: 'POST',
    body,
    idempotencyKey,
  });
}
