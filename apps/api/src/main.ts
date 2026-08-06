import 'reflect-metadata';

import { createApiApplication } from './bootstrap/create-application.js';
import { loadApiConfig } from './config/api-config.js';
import { createApiLogger } from './http/logging/api-logger.js';

export async function bootstrap(environment: NodeJS.ProcessEnv = process.env): Promise<void> {
  const config = loadApiConfig(environment);
  const logger = createApiLogger(config);
  const app = await createApiApplication({ config, logger, enableShutdownHooks: true });
  await app.listen({ host: config.host, port: config.port });
  logger.info({ host: config.host, port: config.port }, 'api.started');
}

if (process.env['NODE_ENV'] !== 'test') {
  void bootstrap().catch((error: unknown) => {
    process.stderr.write(
      `API startup failed: ${error instanceof Error ? error.message : 'unknown error'}\n`,
    );
    process.exitCode = 1;
  });
}
