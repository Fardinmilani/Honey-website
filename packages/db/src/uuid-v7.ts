import { randomBytes } from 'node:crypto';

const MAX_UUID_TIMESTAMP = 0xffff_ffff_ffff;

export function uuidV7(timestamp = Date.now()): string {
  if (!Number.isSafeInteger(timestamp) || timestamp < 0 || timestamp > MAX_UUID_TIMESTAMP) {
    throw new RangeError('UUID v7 timestamp must be a non-negative 48-bit integer.');
  }

  const bytes = Buffer.alloc(16);
  bytes.writeUIntBE(timestamp, 0, 6);
  randomBytes(10).copy(bytes, 6);
  bytes.writeUInt8((bytes.readUInt8(6) & 0x0f) | 0x70, 6);
  bytes.writeUInt8((bytes.readUInt8(8) & 0x3f) | 0x80, 8);

  const value = bytes.toString('hex');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}
