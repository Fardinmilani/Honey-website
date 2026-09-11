/**
 * Cart only needs a display-safe image URL. The media module owns storage keys,
 * visibility, and the conversion of an asset to a public URL.
 */
export type CartPublicImage = Readonly<{
  id: string;
  url: string;
}>;

export interface CartMediaPort {
  resolvePublicImages(assetIds: readonly string[]): Promise<readonly CartPublicImage[]>;
}
