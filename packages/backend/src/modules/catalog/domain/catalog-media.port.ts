export type CatalogMediaAsset = Readonly<{
  id: string;
  kind: 'IMAGE' | 'VIDEO';
  width: number | null;
  height: number | null;
  url: string;
  altTextByLocale: Readonly<Record<string, string>>;
}>;

export interface CatalogMediaPort {
  resolvePublicAssets(assetIds: readonly string[]): Promise<readonly CatalogMediaAsset[]>;
}
