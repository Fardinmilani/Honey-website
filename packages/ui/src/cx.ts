/**
 * Join class name parts. Falsy values are omitted.
 */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join(' ');
}
