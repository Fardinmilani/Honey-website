import { record, optionalText } from './validation';
import type { CsrfConfig } from './types';

export class AdminRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    readonly requestId: string | null,
    readonly issues: readonly Readonly<{ path: string; code: string }>[] = [],
  ) {
    super('ADMIN_REQUEST_FAILED');
  }
}
export function csrfHeaders(config: CsrfConfig): Record<string, string> {
  const pair = document.cookie
    .split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${config.cookieName}=`));
  const token = pair?.slice(config.cookieName.length + 1);
  return token === undefined ? {} : { [config.headerName]: token };
}
export async function adminMutation(
  path: string,
  body: unknown,
  config: CsrfConfig,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'POST',
  key?: string,
): Promise<unknown> {
  if (!path.startsWith('/api/bff/admin/') || path.includes('..'))
    throw new Error('ADMIN_PATH_INVALID');
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      'content-type': 'application/json',
      ...csrfHeaders(config),
      ...(key === undefined ? {} : { 'idempotency-key': key }),
    },
    ...(method === 'DELETE' ? {} : { body: JSON.stringify(body) }),
  });
  const raw: unknown = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    const problem = record(raw);
    const issues: { path: string; code: string }[] = [];
    if (Array.isArray(problem['errors']))
      for (const value of problem['errors'].slice(0, 100)) {
        const issue = record(value);
        if (typeof issue['path'] === 'string' && typeof issue['code'] === 'string')
          issues.push({ path: issue['path'], code: issue['code'] });
      }
    throw new AdminRequestError(
      response.status,
      optionalText(problem['code']),
      optionalText(problem['requestId']),
      issues,
    );
  }
  return raw;
}
