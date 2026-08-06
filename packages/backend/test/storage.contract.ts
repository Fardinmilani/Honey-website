import { Blob } from 'node:buffer';
import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type {
  DirectUploadAuthorization,
  StorageService,
} from '../src/modules/media/domain/storage.port.js';

export type StorageContractHarness = Readonly<{
  storage: StorageService;
  uploadDirectly: (
    authorization: DirectUploadAuthorization,
    body: Uint8Array,
    contentType: string,
  ) => Promise<void>;
  fetchSigned?: (url: string) => Promise<Uint8Array>;
}>;

export function storageContract(
  name: string,
  createHarness: () => Promise<StorageContractHarness>,
): void {
  describe(`${name} storage contract`, () => {
    it('supports constrained direct upload, metadata, bounded reads, copy, delete, and isolation', async () => {
      const harness = await createHarness();
      const prefix = `phase7-contract/${randomUUID()}`;
      const quarantineKey = `${prefix}/quarantine/original`;
      const copyKey = `${prefix}/copy/object`;
      const body = new TextEncoder().encode('bounded storage contract');
      try {
        const authorization = await harness.storage.createDirectUploadAuthorization({
          bucket: 'private',
          key: quarantineKey,
          contentType: 'image/jpeg',
          maximumBytes: 1_024,
          expiresInSeconds: 60,
        });
        expect(authorization.method).toBe('POST');
        expect(authorization.fields['key']).toBe(quarantineKey);
        expect(authorization.expiresAt.getTime()).toBeGreaterThan(Date.now());
        await harness.uploadDirectly(authorization, body, 'image/jpeg');

        const inspected = await harness.storage.inspectObject('private', quarantineKey);
        expect(inspected).toMatchObject({
          bucket: 'private',
          key: quarantineKey,
          bytes: body.byteLength,
        });
        expect(await harness.storage.objectExists('public', quarantineKey)).toBe(false);
        const range = await harness.storage.readObjectRange(
          'private',
          quarantineKey,
          0,
          6,
          inspected?.versionTag ?? undefined,
        );
        expect(new TextDecoder().decode(range)).toBe('bounded');
        await expect(
          harness.storage.readObject('private', quarantineKey, body.byteLength - 1),
        ).rejects.toThrow();
        expect(
          await harness.storage.readObject(
            'private',
            quarantineKey,
            body.byteLength,
            inspected?.versionTag ?? undefined,
          ),
        ).toEqual(body);

        await harness.storage.copyObject(
          { bucket: 'private', key: quarantineKey },
          { bucket: 'private', key: copyKey },
        );
        expect(await harness.storage.objectExists('private', copyKey)).toBe(true);
        const signed = await harness.storage.createSignedDownloadUrl('private', copyKey, 60);
        expect(signed.expiresAt.getTime()).toBeGreaterThan(Date.now());
        if (harness.fetchSigned !== undefined) {
          await expect(harness.fetchSigned(signed.url)).resolves.toEqual(body);
        }
        await harness.storage.deleteObject('private', copyKey);
        await harness.storage.deleteObject('private', copyKey);
        expect(await harness.storage.objectExists('private', copyKey)).toBe(false);
      } finally {
        await Promise.allSettled([
          harness.storage.deleteObject('private', quarantineKey),
          harness.storage.deleteObject('private', copyKey),
        ]);
        await harness.storage.close();
      }
    });

    it('rejects unsafe, user-shaped, and Hero-related keys', async () => {
      const harness = await createHarness();
      try {
        for (const key of ['../escape', '/leading', 'bad\\key', 'hero/honey-scroll.mp4']) {
          await expect(
            harness.storage.createDirectUploadAuthorization({
              bucket: 'private',
              key,
              contentType: 'image/jpeg',
              maximumBytes: 10,
              expiresInSeconds: 10,
            }),
          ).rejects.toThrow();
        }
      } finally {
        await harness.storage.close();
      }
    });
  });
}

export async function postAuthorization(
  authorization: Pick<DirectUploadAuthorization, 'fields' | 'method' | 'url'>,
  body: Uint8Array,
  contentType: string,
): Promise<void> {
  const form = new FormData();
  for (const [key, value] of Object.entries(authorization.fields)) form.set(key, value);
  form.set('file', new Blob([body], { type: contentType }), 'upload.bin');
  const response = await fetch(authorization.url, { method: 'POST', body: form });
  if (!response.ok) throw new Error(`Direct storage upload failed with ${response.status}.`);
}
