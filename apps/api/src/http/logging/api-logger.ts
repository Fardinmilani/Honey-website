import type { LoggerService } from '@nestjs/common';
import pino, { type Logger } from 'pino';

import type { ApiConfig } from '../../config/api-config.js';

const REDACT_PATHS = [
  'authorization',
  'cookie',
  'set-cookie',
  'x-csrf-token',
  '*.authorization',
  '*.cookie',
  '*.set-cookie',
  '*.x-csrf-token',
  '*.password',
  '*.token',
  '*.secret',
  '*.databaseUrl',
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers.set-cookie',
] as const;

export function createApiLogger(config: ApiConfig, destination?: NodeJS.WritableStream): Logger {
  const options: pino.LoggerOptions = {
    level: config.logLevel,
    base: { service: 'honey-api', environment: config.nodeEnv },
    redact: { paths: [...REDACT_PATHS], censor: '[Redacted]' },
  };
  return destination === undefined ? pino(options) : pino(options, destination);
}

export class PinoNestLogger implements LoggerService {
  constructor(private readonly logger: Logger) {}

  log(message: unknown, context?: string): void {
    this.logger.info({ context, message });
  }

  error(message: unknown, trace?: string, context?: string): void {
    this.logger.error({ context, trace, message });
  }

  warn(message: unknown, context?: string): void {
    this.logger.warn({ context, message });
  }

  debug(message: unknown, context?: string): void {
    this.logger.debug({ context, message });
  }

  verbose(message: unknown, context?: string): void {
    this.logger.trace({ context, message });
  }

  fatal(message: unknown, context?: string): void {
    this.logger.fatal({ context, message });
  }
}
