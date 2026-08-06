import { DependencyUnavailableAppError } from '../../errors/index.js';
import type { DatabaseHealthPort } from '../domain/database-health.port.js';
import type { ReadinessStatus } from '../domain/health.js';

export class HealthService {
  constructor(
    private readonly database: DatabaseHealthPort,
    private readonly timeoutMs: number,
  ) {}

  async readiness(): Promise<ReadinessStatus> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.database.check(),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(
            () => reject(new Error('Database readiness timed out.')),
            this.timeoutMs,
          );
        }),
      ]);
      return { status: 'ready', checks: { database: 'ready' } };
    } catch (cause) {
      throw new DependencyUnavailableAppError({
        cause,
        retryAfterSeconds: 1,
        internalMetadata: { dependency: 'database' },
      });
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
    }
  }
}
