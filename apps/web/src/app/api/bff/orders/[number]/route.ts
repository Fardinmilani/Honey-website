import { invalidRequest, proxyCheckoutRequest, validOrderNumber } from '../../checkout/_proxy';

type OrderRouteProps = Readonly<{
  params: Promise<{ number: string }>;
}>;

export async function GET(request: Request, { params }: OrderRouteProps) {
  const { number } = await params;
  if (!validOrderNumber(number)) return invalidRequest();
  return proxyCheckoutRequest(request, {
    path: `/v1/orders/${encodeURIComponent(number)}`,
    method: 'GET',
  });
}
