import { safeJsonLdStringify } from '../../lib/seo/json-ld';

type JsonLdScriptProps = {
  readonly data: unknown;
};

export function JsonLdScript({ data }: JsonLdScriptProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(data) }}
    />
  );
}
