import type { BackupVerificationPort } from '../domain/backup-verification.port.js';

const CORRELATION_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;

/** Cannot be constructed without a concrete verifier; no Phase 16 adapter exists. */
export class BackupVerificationService {
  constructor(private readonly port: BackupVerificationPort) {}

  verify(input: Readonly<{ correlationId: string }>): Promise<void> {
    if (!CORRELATION_ID.test(input.correlationId)) {
      throw new TypeError('Invalid backup verification correlation ID.');
    }
    return this.port.verify(input);
  }
}
