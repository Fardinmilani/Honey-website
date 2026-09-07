export type OrganizationJsonLdInput = {
  readonly name: string;
  readonly url: string;
  readonly description?: string;
};

export type OrganizationJsonLd = {
  readonly '@context': 'https://schema.org';
  readonly '@type': 'Organization';
  readonly name: string;
  readonly url: string;
  readonly description?: string;
};

export function buildOrganizationJsonLd(input: OrganizationJsonLdInput): OrganizationJsonLd {
  const jsonLd: OrganizationJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: input.name,
    url: input.url,
  };

  if (input.description !== undefined) {
    return { ...jsonLd, description: input.description };
  }

  return jsonLd;
}
