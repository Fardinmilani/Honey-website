import { createPrismaClient, type Prisma, type PrismaClient } from '@honey/db';

import { ConflictAppError } from '../../../errors/index.js';
import {
  canonicalPublicUrl,
  DERIVATIVE_VARIANTS,
  isMediaMimeType,
  normalizeAltText,
  type DerivativeVariant,
  type MediaAsset,
} from '../domain/media.js';
import type { MediaRepository, PersistedAssetInput } from '../domain/media-repository.port.js';

const assetInclude = {
  derivatives: { orderBy: [{ variant: 'asc' }, { width: 'asc' }] },
} satisfies Prisma.MediaAssetInclude;

type StoredAsset = Prisma.MediaAssetGetPayload<{ include: typeof assetInclude }>;

function safeNumber(value: bigint): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0)
    throw new Error('Stored media byte count is invalid.');
  return number;
}

function derivativeVariant(value: string): DerivativeVariant {
  const variant = DERIVATIVE_VARIANTS.find((candidate) => candidate === value);
  if (variant === undefined) throw new Error('Stored media derivative variant is invalid.');
  return variant;
}

function altText(value: Prisma.JsonValue | null): Readonly<Record<string, string>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {};
  const candidate: Record<string, string> = {};
  for (const [locale, text] of Object.entries(value)) {
    if (typeof text !== 'string') throw new Error('Stored media alt text is invalid.');
    candidate[locale] = text;
  }
  return normalizeAltText(candidate);
}

function jsonAltText(value: Readonly<Record<string, string>>): Prisma.InputJsonObject {
  return Object.fromEntries(Object.entries(value));
}

function isPrismaCode(error: unknown, code: string): boolean {
  return error !== null && typeof error === 'object' && 'code' in error && error.code === code;
}

export class PrismaMediaRepository implements MediaRepository {
  readonly #client: PrismaClient;

  constructor(
    databaseUrl: string,
    private readonly publicBaseUrl: string,
  ) {
    this.#client = createPrismaClient({ databaseUrl });
  }

  async createAsset(input: PersistedAssetInput): Promise<MediaAsset> {
    const existing = await this.#client.mediaAsset.findUnique({
      where: { id: input.id },
      include: assetInclude,
    });
    if (existing !== null) {
      if (existing.checksum !== input.checksum) {
        throw new ConflictAppError({ code: 'MEDIA_ASSET_CONFLICT' });
      }
      return this.#asset(existing);
    }
    try {
      const created = await this.#client.mediaAsset.create({
        data: {
          id: input.id,
          kind: input.kind,
          visibility: input.visibility,
          storageKey: input.storageKey,
          mimeType: input.mimeType,
          bytes: BigInt(input.bytes),
          width: input.width,
          height: input.height,
          durationSeconds: input.durationSeconds,
          checksum: input.checksum,
          altTextByLocale: jsonAltText(input.altTextByLocale),
          createdBy: input.createdBy,
          updatedBy: input.createdBy,
          derivatives: {
            create: input.derivatives.map((derivative) => ({
              id: derivative.id,
              variant: derivative.variant,
              format: derivative.format,
              mimeType: derivative.mimeType,
              width: derivative.width,
              height: derivative.height,
              bytes: BigInt(derivative.bytes),
              checksum: derivative.checksum,
              storageKey: derivative.storageKey,
              createdBy: input.createdBy,
              updatedBy: input.createdBy,
            })),
          },
        },
        include: assetInclude,
      });
      return this.#asset(created);
    } catch (error) {
      if (isPrismaCode(error, 'P2002')) {
        const retry = await this.#client.mediaAsset.findUnique({
          where: { id: input.id },
          include: assetInclude,
        });
        if (retry !== null && retry.checksum === input.checksum) return this.#asset(retry);
        throw new ConflictAppError({ code: 'MEDIA_ASSET_CONFLICT', cause: error });
      }
      throw error;
    }
  }

  async findAsset(assetId: string): Promise<MediaAsset | null> {
    const asset = await this.#client.mediaAsset.findUnique({
      where: { id: assetId },
      include: assetInclude,
    });
    return asset === null ? null : this.#asset(asset);
  }

  async findAssets(assetIds: readonly string[]): Promise<readonly MediaAsset[]> {
    if (assetIds.length === 0) return [];
    const assets = await this.#client.mediaAsset.findMany({
      where: { id: { in: [...new Set(assetIds)].slice(0, 100) } },
      include: assetInclude,
      orderBy: { id: 'asc' },
    });
    return assets.map((asset) => this.#asset(asset));
  }

  async updateAltText(
    assetId: string,
    altTextByLocale: Readonly<Record<string, string>>,
  ): Promise<MediaAsset | null> {
    const exists = await this.#client.mediaAsset.findUnique({
      where: { id: assetId },
      select: { id: true },
    });
    if (exists === null) return null;
    const updated = await this.#client.mediaAsset.update({
      where: { id: assetId },
      data: {
        altTextByLocale: jsonAltText(altTextByLocale),
        updatedBy: null,
      },
      include: assetInclude,
    });
    return this.#asset(updated);
  }

  async deleteUnattachedAsset(assetId: string): Promise<MediaAsset | null> {
    const existing = await this.#client.mediaAsset.findUnique({
      where: { id: assetId },
      include: assetInclude,
    });
    if (existing === null) return null;
    try {
      await this.#client.mediaAsset.delete({ where: { id: assetId } });
    } catch (error) {
      if (isPrismaCode(error, 'P2003')) {
        throw new ConflictAppError({ code: 'MEDIA_ASSET_ATTACHED', cause: error });
      }
      throw error;
    }
    return this.#asset(existing);
  }

  async close(): Promise<void> {
    await this.#client.$disconnect();
  }

  #asset(asset: StoredAsset): MediaAsset {
    if (!isMediaMimeType(asset.mimeType)) throw new Error('Stored media MIME type is invalid.');
    if (asset.createdBy === null) throw new Error('Stored media creator is missing.');
    const isPublic = asset.visibility === 'PUBLIC';
    return {
      id: asset.id,
      kind: asset.kind,
      visibility: asset.visibility,
      mimeType: asset.mimeType,
      bytes: safeNumber(asset.bytes),
      width: asset.width,
      height: asset.height,
      durationSeconds: asset.durationSeconds,
      checksum: asset.checksum,
      altTextByLocale: altText(asset.altTextByLocale),
      url: isPublic ? canonicalPublicUrl(this.publicBaseUrl, asset.storageKey) : null,
      createdBy: asset.createdBy,
      createdAt: asset.createdAt.toISOString(),
      updatedAt: asset.updatedAt.toISOString(),
      derivatives: asset.derivatives.map((derivative) => {
        if (derivative.format !== 'webp' && derivative.format !== 'jpg') {
          throw new Error('Stored media derivative format is invalid.');
        }
        if (derivative.mimeType !== 'image/webp' && derivative.mimeType !== 'image/jpeg') {
          throw new Error('Stored media derivative MIME type is invalid.');
        }
        return {
          id: derivative.id,
          variant: derivativeVariant(derivative.variant),
          format: derivative.format,
          mimeType: derivative.mimeType,
          width: derivative.width,
          height: derivative.height,
          bytes: safeNumber(derivative.bytes),
          checksum: derivative.checksum,
          url: isPublic ? canonicalPublicUrl(this.publicBaseUrl, derivative.storageKey) : null,
        };
      }),
    };
  }
}
