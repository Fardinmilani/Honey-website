export type JobFailureErrorClass = 'TRANSIENT' | 'PERMANENT' | 'EXHAUSTED';

/** Only bounded operational metadata is accepted. Raw payloads/errors have no field here. */
export type TerminalJobFailure = Readonly<{
  queue: string;
  jobId: string;
  name: string;
  payloadVersion: number;
  correlationId?: string;
  attemptsMade: number;
  errorCode: string;
  errorClass: JobFailureErrorClass;
  terminalCycle: string;
  failedAt?: Date;
}>;

export type RecordedJobFailure = Readonly<{ id: string; created: boolean }>;

export interface JobFailureRepository {
  recordTerminalFailure(failure: TerminalJobFailure): Promise<RecordedJobFailure>;
  countUnresolvedByQueue(): Promise<Readonly<Record<string, number>>>;
  close(): Promise<void>;
}
