import { invalidRequest, proxyPaymentRequest, validPaymentId } from '../../_proxy';

type RouteContext = Readonly<{ params: Promise<{ id: string }> }>;

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!validPaymentId(id)) return invalidRequest();
  return proxyPaymentRequest(request, { path: `/v1/payments/${id}/return`, method: 'POST' });
}
