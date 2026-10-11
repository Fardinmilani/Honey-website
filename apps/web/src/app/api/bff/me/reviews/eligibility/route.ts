import { adminRoute } from '@/lib/admin/bff';
import { NextResponse } from 'next/server';
import type { AdminRouteContext } from '@/lib/admin/bff';
const checkEligibility = adminRoute({
  method: 'GET',
  path: '/v1/me/reviews/eligibility',
  query: ['productId'],
});
export async function GET(request: Request, context: AdminRouteContext) {
  const response = await checkEligibility(request, context);
  // Anonymous or expired sessions cannot qualify. Keep the storefront result
  // neutral and private; the protected API still requires a valid capability.
  if (response.status === 401)
    return NextResponse.json(
      { eligible: false },
      { headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' } },
    );
  return response;
}
