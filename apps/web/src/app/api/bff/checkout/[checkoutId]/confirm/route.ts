import {
  invalidRequest,
  parseIdempotencyKey,
  proxyCheckoutRequest,
  validCheckoutId,
} from '../../_proxy';

type CheckoutConfirmRouteProps = Readonly<{
  params: Promise<{ checkoutId: string }>;
}>;

export async function POST(request: Request, { params }: CheckoutConfirmRouteProps) {
  const { checkoutId } = await params;
  const idempotencyKey = parseIdempotencyKey(request);
  if (!validCheckoutId(checkoutId) || idempotencyKey === null) return invalidRequest();
  return proxyCheckoutRequest(request, {
    path: `/v1/checkout/${encodeURIComponent(checkoutId)}/confirm`,
    method: 'POST',
    idempotencyKey,
  });
}
