import { createClient, type RedisClientType } from 'redis';

import {
  isMediaMimeType,
  MEDIA_VISIBILITIES,
  normalizeAltText,
  type MediaVisibility,
} from '../domain/media.js';
import type {
  UploadIntent,
  UploadIntentCompletion,
  UploadIntentStore,
} from '../domain/upload-intent.port.js';

const BEGIN_COMPLETION = `
local value = redis.call('GET', KEYS[1])
if not value then return nil end
local state = cjson.decode(value)
if state.ownerUserId ~= ARGV[1] then return nil end
if state.state == 'PENDING' then
  state.state = 'PROCESSING'
  local ttl = redis.call('PTTL', KEYS[1])
  redis.call('SET', KEYS[1], cjson.encode(state), 'PX', ttl)
  state.state = 'CLAIMED'
end
return cjson.encode(state)
`;

const MARK_COMPLETED = `
local value = redis.call('GET', KEYS[1])
if not value then return 0 end
local state = cjson.decode(value)
if state.ownerUserId ~= ARGV[1] or state.assetId ~= ARGV[2] or state.state == 'PENDING' then
  return 0
end
state.state = 'COMPLETED'
local ttl = redis.call('PTTL', KEYS[1])
redis.call('SET', KEYS[1], cjson.encode(state), 'PX', ttl)
return 1
`;

type SerializedIntent = Readonly<{
  state: 'PENDING' | 'CLAIMED' | 'PROCESSING' | 'COMPLETED';
  uploadId: string;
  assetId: string;
  ownerUserId: string;
  declaredMimeType: string;
  declaredBytes: number;
  visibility: string;
  altTextByLocale: Readonly<Record<string, string>>;
  quarantineKey: string;
  expiresAt: string;
}>;

function serialize(intent: UploadIntent): string {
  return JSON.stringify({
    state: 'PENDING',
    ...intent,
    expiresAt: intent.expiresAt.toISOString(),
  } satisfies SerializedIntent);
}

function stringProperty(value: object, key: string): string {
  const property = Object.entries(value).find(([entryKey]) => entryKey === key)?.[1];
  if (typeof property !== 'string' || property.length === 0) {
    throw new Error(`Upload intent contains invalid ${key}.`);
  }
  return property;
}

function parse(
  value: string,
): Readonly<{ state: SerializedIntent['state']; intent: UploadIntent }> {
  const decoded: unknown = JSON.parse(value);
  if (decoded === null || typeof decoded !== 'object') throw new Error('Invalid upload intent.');
  const state = stringProperty(decoded, 'state');
  if (
    state !== 'PENDING' &&
    state !== 'CLAIMED' &&
    state !== 'PROCESSING' &&
    state !== 'COMPLETED'
  ) {
    throw new Error('Invalid upload intent state.');
  }
  const declaredMimeType = stringProperty(decoded, 'declaredMimeType');
  if (!isMediaMimeType(declaredMimeType)) throw new Error('Invalid upload intent MIME type.');
  const visibilityText = stringProperty(decoded, 'visibility');
  const visibility: MediaVisibility | undefined = MEDIA_VISIBILITIES.find(
    (candidate) => candidate === visibilityText,
  );
  if (visibility === undefined) throw new Error('Invalid upload intent visibility.');
  if (!('declaredBytes' in decoded) || typeof decoded.declaredBytes !== 'number') {
    throw new Error('Invalid upload intent byte count.');
  }
  if (
    !('altTextByLocale' in decoded) ||
    decoded.altTextByLocale === null ||
    typeof decoded.altTextByLocale !== 'object' ||
    Array.isArray(decoded.altTextByLocale)
  ) {
    throw new Error('Invalid upload intent alt text.');
  }
  const rawAlt: Record<string, string> = {};
  for (const [locale, text] of Object.entries(decoded.altTextByLocale)) {
    if (typeof text !== 'string') throw new Error('Invalid upload intent alt text value.');
    rawAlt[locale] = text;
  }
  const expiresAt = new Date(stringProperty(decoded, 'expiresAt'));
  if (!Number.isFinite(expiresAt.getTime())) throw new Error('Invalid upload intent expiry.');
  return {
    state,
    intent: {
      uploadId: stringProperty(decoded, 'uploadId'),
      assetId: stringProperty(decoded, 'assetId'),
      ownerUserId: stringProperty(decoded, 'ownerUserId'),
      declaredMimeType,
      declaredBytes: decoded.declaredBytes,
      visibility,
      altTextByLocale: normalizeAltText(rawAlt),
      quarantineKey: stringProperty(decoded, 'quarantineKey'),
      expiresAt,
    },
  };
}

function numericResult(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return 0;
}

export class RedisUploadIntentAdapter implements UploadIntentStore {
  readonly #client: RedisClientType;
  #connecting: Promise<unknown> | undefined;

  constructor(redisUrl: string) {
    this.#client = createClient({ url: redisUrl });
    this.#client.on('error', () => undefined);
  }

  async create(intent: UploadIntent, ttlSeconds: number): Promise<void> {
    await this.#ready();
    const result = await this.#client.set(this.#key(intent.uploadId), serialize(intent), {
      NX: true,
      EX: ttlSeconds,
    });
    if (result !== 'OK') throw new Error('Could not create upload intent.');
  }

  async beginCompletion(
    uploadId: string,
    ownerUserId: string,
  ): Promise<UploadIntentCompletion | null> {
    await this.#ready();
    const value = await this.#client.eval(BEGIN_COMPLETION, {
      keys: [this.#key(uploadId)],
      arguments: [ownerUserId],
    });
    if (typeof value !== 'string') return null;
    const parsed = parse(value);
    if (parsed.state === 'COMPLETED') {
      return { state: 'COMPLETED', assetId: parsed.intent.assetId };
    }
    return parsed.state === 'CLAIMED'
      ? { state: 'CLAIMED', intent: parsed.intent }
      : { state: 'PROCESSING', intent: parsed.intent };
  }

  async markCompleted(uploadId: string, ownerUserId: string, assetId: string): Promise<void> {
    await this.#ready();
    const result = await this.#client.eval(MARK_COMPLETED, {
      keys: [this.#key(uploadId)],
      arguments: [ownerUserId, assetId],
    });
    if (numericResult(result) !== 1) throw new Error('Could not complete upload intent.');
  }

  async close(): Promise<void> {
    if (this.#client.isOpen) await this.#client.close();
  }

  async #ready(): Promise<void> {
    if (this.#client.isReady) return;
    this.#connecting ??= this.#client.connect();
    await this.#connecting;
  }

  #key(uploadId: string): string {
    return `media:upload-intent:${uploadId}`;
  }
}
