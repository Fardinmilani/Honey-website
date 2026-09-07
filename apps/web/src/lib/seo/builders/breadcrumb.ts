export type BreadcrumbItem = {
  readonly name: string;
  readonly url: string;
};

export type BreadcrumbListJsonLd = {
  readonly '@context': 'https://schema.org';
  readonly '@type': 'BreadcrumbList';
  readonly itemListElement: ReadonlyArray<{
    readonly '@type': 'ListItem';
    readonly position: number;
    readonly name: string;
    readonly item: string;
  }>;
};

export function buildBreadcrumbListJsonLd(items: readonly BreadcrumbItem[]): BreadcrumbListJsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}
