export function buildArticleJsonLd(
  input: Readonly<{
    title: string;
    description: string;
    url: string;
    locale: string;
    publishedAt: string;
    updatedAt: string;
    brandName: string;
  }>,
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: input.title,
    description: input.description,
    mainEntityOfPage: input.url,
    url: input.url,
    inLanguage: input.locale,
    datePublished: input.publishedAt,
    dateModified: input.updatedAt,
    publisher: { '@type': 'Organization', name: input.brandName },
  };
}
export function buildFaqJsonLd(
  items: readonly Readonly<{ question: string; answer: string }>[],
  locale: string,
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    inLanguage: locale,
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  };
}
