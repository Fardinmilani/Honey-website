import { PrismaAuditWriter } from '../../identity/index.js';
import type { MediaAuditInput, MediaAuditPort } from '../domain/media-audit.port.js';

export class IdentityMediaAuditAdapter implements MediaAuditPort {
  readonly #writer: PrismaAuditWriter;

  constructor(databaseUrl: string) {
    this.#writer = new PrismaAuditWriter(databaseUrl);
  }

  append(input: MediaAuditInput): Promise<void> {
    return this.#writer.appendAudit({
      actorUserId: input.actorUserId,
      action: input.action,
      subjectType: 'media_asset',
      subjectId: input.assetId,
      metadata: {
        requestId: input.requestId,
        ...(input.clientIp === undefined ? {} : { clientIp: input.clientIp }),
      },
    });
  }

  close(): Promise<void> {
    return this.#writer.close();
  }
}
