import {
  invalidRequest,
  parseShippingSelection,
  proxyCheckoutRequest,
  validCheckoutId,
} from '../../_proxy';

type ShippingSelectionRouteProps = Readonly<{
  params: Promise<{ checkoutId: string }>;
}>;

export async function POST(request: Request, { params }: ShippingSelectionRouteProps) {
  const { checkoutId } = await params;
  if (!validCheckoutId(checkoutId)) return invalidRequest();
  const selection = await parseShippingSelection(request);
  if (selection === null) return invalidRequest();
  return proxyCheckoutRequest(request, {
    path: `/v1/checkout/${encodeURIComponent(checkoutId)}/shipping-selection`,
    method: 'POST',
    body: selection,
  });
}
