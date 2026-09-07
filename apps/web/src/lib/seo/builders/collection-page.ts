export type CollectionPageJsonLdInput = {
  readonly name: string;
  readonly description: string;
  readonly url: string;
  readonly inLanguage: string;
};

export type CollectionPageJsonLd = {
  readonly '@context': 'https://schema.org';
  readonly '@type': 'CollectionPage';
  readonly name: string;
  readonly description: string;
  readonly url: string;
  readonly inLanguage: string;
};

export type ItemListEntry = {
  readonly name: string;
  readonly url: string;
};

export type ItemListJsonLd = {
  readonly '@context': 'https://schema.org';
  readonly '@type': 'ItemList';
  readonly itemListElement: ReadonlyArray<{
    readonly '@type': 'ListItem';
    readonly position: number;
    readonly name: string;
    readonly url: string;
  }>;
};

export function buildCollectionPageJsonLd(input: CollectionPageJsonLdInput): CollectionPageJsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: input.name,
    description: input.description,
    url: input.url,
    inLanguage: input.inLanguage,
  };
}

export function buildItemListJsonLd(items: readonly ItemListEntry[]): ItemListJsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      url: item.url,
    })),
  };
}
