import { invalidRequest, parseUpdateCartLine, proxyCartRequest, validLineId } from '../../_proxy';

type CartLineRouteProps = Readonly<{
  params: Promise<{ lineId: string }>;
}>;

export async function PATCH(request: Request, { params }: CartLineRouteProps) {
  const { lineId } = await params;
  const body = await parseUpdateCartLine(request);
  if (!validLineId(lineId) || body === null) return invalidRequest();
  return proxyCartRequest(request, {
    path: `/v1/cart/lines/${encodeURIComponent(lineId)}`,
    method: 'PATCH',
    body,
  });
}

export async function DELETE(request: Request, { params }: CartLineRouteProps) {
  const { lineId } = await params;
  if (!validLineId(lineId)) return invalidRequest();
  return proxyCartRequest(request, {
    path: `/v1/cart/lines/${encodeURIComponent(lineId)}`,
    method: 'DELETE',
  });
}
