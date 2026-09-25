import { invalidRequest, proxyCheckoutRequest, validCheckoutId } from '../../_proxy';

type CheckoutExtendRouteProps = Readonly<{
  params: Promise<{ checkoutId: string }>;
}>;

/**
 * Explicit checkout re-entry hold extension (domain-model.md §7). This is a
 * deliberate action the checkout page calls once when it mounts on an
 * already-open checkout — never on a timer or on every background poll —
 * so refreshing the page cannot extend stock indefinitely. The server-owned
 * extension logic is itself idempotent and self-limiting to one real
 * extension per checkout.
 */
export async function POST(request: Request, { params }: CheckoutExtendRouteProps) {
  const { checkoutId } = await params;
  if (!validCheckoutId(checkoutId)) return invalidRequest();
  return proxyCheckoutRequest(request, {
    path: `/v1/checkout/${encodeURIComponent(checkoutId)}/extend`,
    method: 'POST',
  });
}
