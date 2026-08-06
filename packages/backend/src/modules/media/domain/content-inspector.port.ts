import type { MediaMimeType } from './media.js';

export interface ContentInspector {
  detect(prefix: Uint8Array): Promise<MediaMimeType>;
}
