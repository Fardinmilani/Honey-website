import type { OnApplicationShutdown } from '@nestjs/common';
import type { Logger } from 'pino';

type ShutdownSignal = 'SIGTERM' | 'SIGINT';

export class GracefulShutdown implements OnApplicationShutdown {
  #signal: ShutdownSignal | undefined;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #removeListeners: (() => void) | undefined;

  constructor(
    private readonly graceMs: number,
    private readonly logger: Logger,
    private readonly forceExit: (code: number) => void = (code) => process.exit(code),
  ) {}

  install(): void {
    if (this.#removeListeners !== undefined) return;
    const handlers = new Map<ShutdownSignal, () => void>();
    for (const signal of ['SIGTERM', 'SIGINT'] as const) {
      const handler = (): void => this.start(signal);
      handlers.set(signal, handler);
      process.prependListener(signal, handler);
    }
    this.#removeListeners = () => {
      for (const [signal, handler] of handlers) process.removeListener(signal, handler);
      this.#removeListeners = undefined;
    };
  }

  start(signal: ShutdownSignal): void {
    if (this.#signal !== undefined) return;
    this.#signal = signal;
    this.logger.info({ signal }, 'shutdown.started');
    this.#timer = setTimeout(() => {
      this.logger.error({ signal }, 'shutdown.deadline_exceeded');
      this.forceExit(1);
    }, this.graceMs);
  }

  onApplicationShutdown(signal?: string): void {
    if (this.#timer !== undefined) clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#removeListeners?.();
    if (this.#signal !== undefined) {
      this.logger.info({ signal: signal ?? this.#signal }, 'shutdown.completed');
    }
  }
}

export function installSignalHandlers(shutdown: GracefulShutdown): void {
  shutdown.install();
}
