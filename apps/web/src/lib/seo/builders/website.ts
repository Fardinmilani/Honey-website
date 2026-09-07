export type WebSiteJsonLdInput = {
  readonly name: string;
  readonly url: string;
  readonly locale: string;
  readonly searchUrlTemplate: string;
};

export type WebSiteJsonLd = {
  readonly '@context': 'https://schema.org';
  readonly '@type': 'WebSite';
  readonly name: string;
  readonly url: string;
  readonly inLanguage: string;
  readonly potentialAction: {
    readonly '@type': 'SearchAction';
    readonly target: {
      readonly '@type': 'EntryPoint';
      readonly urlTemplate: string;
    };
    readonly 'query-input': 'required name=search_term_string';
  };
};

export function buildWebSiteJsonLd(input: WebSiteJsonLdInput): WebSiteJsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: input.name,
    url: input.url,
    inLanguage: input.locale,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: input.searchUrlTemplate,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}
