/**
 * Serializes JSON-LD for safe embedding in a `<script type="application/ld+json">`
 * tag by escaping `<` to prevent script breakout.
 */
export function safeJsonLdStringify(value: unknown): string {
  return JSON.stringify(value).replace(/</gu, '\\u003c');
}
