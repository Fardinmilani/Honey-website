/** Phase 20 supplies the concrete verifier. Phase 16 only owns orchestration. */
export interface BackupVerificationPort {
  verify(input: Readonly<{ correlationId: string }>): Promise<void>;
}
