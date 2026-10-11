import { ValidationAppError } from '../../errors/index.js';

export type AdminPageInput = Readonly<{ cursor?: string; limit?: number }>;
export type AdminPage<T> = Readonly<{ items: readonly T[]; nextCursor: string | null }>;

export function adminIdentifier(value: string, path = 'id'): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value)) {
    throw new ValidationAppError([{ path, code: 'ADMIN_IDENTIFIER_INVALID' }]);
  }
  return value;
}

export function adminPageInput(
  input: AdminPageInput,
): Readonly<{ cursor?: string; limit: number }> {
  const limit = input.limit ?? 25;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new ValidationAppError([{ path: 'limit', code: 'ADMIN_LIMIT_INVALID' }]);
  }
  return {
    limit,
    ...(input.cursor === undefined ? {} : { cursor: adminIdentifier(input.cursor, 'cursor') }),
  };
}

export function adminPage<T extends Readonly<{ id: string }>>(
  rows: readonly T[],
  limit: number,
): AdminPage<T> {
  const items = rows.slice(0, limit);
  return { items, nextCursor: rows.length > limit ? (items.at(-1)?.id ?? null) : null };
}
