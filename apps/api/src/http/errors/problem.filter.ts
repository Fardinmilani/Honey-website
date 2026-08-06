import { type ArgumentsHost, Catch, type ExceptionFilter } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Logger } from 'pino';

import { AppError } from '@honey/backend';
import { toProblem } from './problem-mapper.js';

@Catch()
export class ProblemExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();
    const problem = toProblem(exception, request.url.split('?')[0] ?? '/', request.id);
    if (!(exception instanceof AppError) || exception.category === 'internal') {
      this.logger.error(
        { err: exception, requestId: request.id, route: request.routeOptions.url },
        'request.failed',
      );
    }
    if (exception instanceof AppError && exception.retryAfterSeconds !== undefined) {
      reply.header('Retry-After', String(exception.retryAfterSeconds));
    }
    reply.type('application/problem+json').status(problem.status).send(problem);
  }
}
