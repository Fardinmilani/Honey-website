export type AdminRecord = Readonly<Record<string, unknown>>;
function isRecord(value: unknown): value is AdminRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function record(value: unknown): AdminRecord {
  if (!isRecord(value)) throw new Error('ADMIN_RESPONSE_INVALID');
  return value;
}
export function records(value: unknown): readonly AdminRecord[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error('ADMIN_RESPONSE_INVALID');
  return value.map(record);
}
export function text(value: unknown): string {
  if (typeof value !== 'string' || value.length > 20000) throw new Error('ADMIN_RESPONSE_INVALID');
  return value;
}
export function optionalText(value: unknown): string | null {
  return value === null || value === undefined ? null : text(value);
}
export function number(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value))
    throw new Error('ADMIN_RESPONSE_INVALID');
  return value;
}
export function flag(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error('ADMIN_RESPONSE_INVALID');
  return value;
}
export function page(
  value: unknown,
): Readonly<{ items: readonly AdminRecord[]; nextCursor: string | null }> {
  const source = record(value);
  return { items: records(source['items']), nextCursor: optionalText(source['nextCursor']) };
}
export function identifier(value: unknown): string {
  const id = text(value);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(id))
    throw new Error('ADMIN_IDENTIFIER_INVALID');
  return id;
}
