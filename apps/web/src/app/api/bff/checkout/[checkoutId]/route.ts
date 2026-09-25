import { invalidRequest, proxyCheckoutRequest, validCheckoutId } from '../_proxy';

type CheckoutRouteProps = Readonly<{
  params: Promise<{ checkoutId: string }>;
}>;

export async function GET(request: Request, { params }: CheckoutRouteProps) {
  const { checkoutId } = await params;
  if (!validCheckoutId(checkoutId)) return invalidRequest();
  return proxyCheckoutRequest(request, {
    path: `/v1/checkout/${encodeURIComponent(checkoutId)}`,
    method: 'GET',
  });
}
