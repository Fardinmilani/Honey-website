import type { AuditInput, AuditWriterPort } from '../domain/ports.js';
import { PrismaIdentityRepository } from './prisma-identity.repository.js';

export class PrismaAuditWriter implements AuditWriterPort {
  readonly #repository: PrismaIdentityRepository;

  constructor(databaseUrl: string) {
    this.#repository = new PrismaIdentityRepository(databaseUrl);
  }

  appendAudit(input: AuditInput): Promise<void> {
    return this.#repository.appendAudit(input);
  }

  close(): Promise<void> {
    return this.#repository.close();
  }
}
