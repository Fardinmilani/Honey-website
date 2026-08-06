import { timingSafeEqual } from 'node:crypto';

import { ForbiddenAppError } from '@honey/backend';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export type CsrfInput = Readonly<{
  method: string;
  cookieToken: string | undefined;
  headerToken: string | undefined;
  exempt?: boolean;
}>;

export function verifyCsrf(input: CsrfInput): void {
  if (input.exempt === true || SAFE_METHODS.has(input.method.toUpperCase())) return;
  if (input.cookieToken === undefined || input.headerToken === undefined) {
    throw new ForbiddenAppError({ code: 'CSRF_TOKEN_INVALID' });
  }
  const cookie = Buffer.from(input.cookieToken);
  const header = Buffer.from(input.headerToken);
  if (cookie.length < 32 || cookie.length !== header.length || !timingSafeEqual(cookie, header)) {
    throw new ForbiddenAppError({ code: 'CSRF_TOKEN_INVALID' });
  }
}
