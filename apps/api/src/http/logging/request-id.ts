import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u;

export function isValidRequestId(value: unknown): value is string {
  return typeof value === 'string' && REQUEST_ID_PATTERN.test(value);
}

export function requestIdFromIncoming(request: IncomingMessage): string {
  const value = request.headers['x-request-id'];
  return isValidRequestId(value) ? value : randomUUID();
}
