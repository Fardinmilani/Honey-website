import {
  invalidRequest,
  parseIdempotencyKey,
  parseStartPayment,
  proxyPaymentRequest,
} from './_proxy';

export async function POST(request: Request) {
  const body = await parseStartPayment(request);
  const idempotencyKey = parseIdempotencyKey(request);
  if (body === null || idempotencyKey === null) return invalidRequest();
  return proxyPaymentRequest(request, {
    path: '/v1/payments',
    method: 'POST',
    body,
    idempotencyKey,
  });
}
