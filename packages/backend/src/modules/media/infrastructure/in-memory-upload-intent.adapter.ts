import type {
  UploadIntent,
  UploadIntentCompletion,
  UploadIntentStore,
} from '../domain/upload-intent.port.js';

type Entry =
  | Readonly<{ state: 'PENDING'; intent: UploadIntent; expiresAtMs: number }>
  | Readonly<{ state: 'PROCESSING'; intent: UploadIntent; expiresAtMs: number }>
  | Readonly<{ state: 'COMPLETED'; intent: UploadIntent; assetId: string; expiresAtMs: number }>;

export class InMemoryUploadIntentAdapter implements UploadIntentStore {
  readonly #entries = new Map<string, Entry>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  async create(intent: UploadIntent, ttlSeconds: number): Promise<void> {
    this.#prune();
    if (this.#entries.has(intent.uploadId)) throw new Error('Upload intent already exists.');
    this.#entries.set(intent.uploadId, {
      state: 'PENDING',
      intent,
      expiresAtMs: this.now().getTime() + ttlSeconds * 1_000,
    });
  }

  async beginCompletion(
    uploadId: string,
    ownerUserId: string,
  ): Promise<UploadIntentCompletion | null> {
    this.#prune();
    const entry = this.#entries.get(uploadId);
    if (entry === undefined || entry.intent.ownerUserId !== ownerUserId) return null;
    if (entry.state === 'COMPLETED') return { state: 'COMPLETED', assetId: entry.assetId };
    if (entry.state === 'PROCESSING') return { state: 'PROCESSING', intent: entry.intent };
    this.#entries.set(uploadId, { ...entry, state: 'PROCESSING' });
    return { state: 'CLAIMED', intent: entry.intent };
  }

  async markCompleted(uploadId: string, ownerUserId: string, assetId: string): Promise<void> {
    this.#prune();
    const entry = this.#entries.get(uploadId);
    if (
      entry === undefined ||
      entry.intent.ownerUserId !== ownerUserId ||
      entry.intent.assetId !== assetId ||
      entry.state === 'PENDING'
    ) {
      throw new Error('Upload intent completion state is invalid.');
    }
    this.#entries.set(uploadId, { ...entry, state: 'COMPLETED', assetId });
  }

  async close(): Promise<void> {}

  #prune(): void {
    const now = this.now().getTime();
    for (const [key, entry] of this.#entries) {
      if (entry.expiresAtMs <= now) this.#entries.delete(key);
    }
  }
}
