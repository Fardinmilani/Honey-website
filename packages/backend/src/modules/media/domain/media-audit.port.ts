export type MediaAuditInput = Readonly<{
  actorUserId: string;
  action: 'media.upload.completed' | 'media.alt-text.updated' | 'media.delete.requested';
  assetId: string;
  requestId: string;
  clientIp?: string;
}>;

export interface MediaAuditPort {
  append(input: MediaAuditInput): Promise<void>;
  close(): Promise<void>;
}
