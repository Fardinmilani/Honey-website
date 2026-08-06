import { fileTypeFromBuffer } from 'file-type';

import { ValidationAppError } from '../../../errors/index.js';
import { isMediaMimeType, type MediaMimeType } from '../domain/media.js';
import type { ContentInspector } from '../domain/content-inspector.port.js';

const EXECUTABLE_SIGNATURES: readonly Readonly<{ prefix: readonly number[]; code: string }>[] = [
  { prefix: [0x4d, 0x5a], code: 'MEDIA_EXECUTABLE_REJECTED' },
  { prefix: [0x7f, 0x45, 0x4c, 0x46], code: 'MEDIA_EXECUTABLE_REJECTED' },
];

function startsWith(input: Uint8Array, prefix: readonly number[]): boolean {
  return prefix.every((byte, index) => input[index] === byte);
}

function reject(code: string): never {
  throw new ValidationAppError([{ path: 'upload', code }]);
}

export class MagicContentInspector implements ContentInspector {
  async detect(prefix: Uint8Array): Promise<MediaMimeType> {
    if (prefix.byteLength < 12) reject('MEDIA_CONTENT_INVALID');
    for (const signature of EXECUTABLE_SIGNATURES) {
      if (startsWith(prefix, signature.prefix)) reject(signature.code);
    }
    const text = Buffer.from(prefix.subarray(0, Math.min(prefix.byteLength, 8_192)))
      .toString('utf8')
      .replace(/^\uFEFF/u, '')
      .trimStart()
      .toLowerCase();
    if (text.startsWith('#!')) reject('MEDIA_EXECUTABLE_REJECTED');
    if (
      text.startsWith('<?xml') ||
      text.startsWith('<svg') ||
      text.includes('<svg') ||
      text.startsWith('<!doctype') ||
      text.startsWith('<html') ||
      text.includes('<script')
    ) {
      reject('MEDIA_MARKUP_REJECTED');
    }

    const detected = await fileTypeFromBuffer(prefix);
    if (detected === undefined || !isMediaMimeType(detected.mime)) {
      reject('MEDIA_CONTENT_INVALID');
    }
    return detected.mime;
  }
}
