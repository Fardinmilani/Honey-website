import 'reflect-metadata';

import { loadWorkerConfig } from './config.js';
import { checkRedisHealth, inspectWorkerMetrics, WorkerRuntime } from './runtime.js';

export async function bootstrap(
  environment: NodeJS.ProcessEnv = process.env,
  args: readonly string[] = process.argv.slice(2),
): Promise<void> {
  const config = loadWorkerConfig(environment);
  if (args.includes('--healthcheck')) {
    await checkRedisHealth(config);
    return;
  }
  if (args.includes('--metrics')) {
    process.stdout.write(`${JSON.stringify(await inspectWorkerMetrics(config))}\n`);
    return;
  }
  if (args.length !== 0) throw new Error('Unknown worker command.');
  const runtime = new WorkerRuntime(config);
  await runtime.start();
  let stopping = false;
  const stop = (signal: 'SIGTERM' | 'SIGINT'): void => {
    if (stopping) return;
    stopping = true;
    process.stdout.write(
      `${JSON.stringify({ level: 'info', event: 'worker.shutdown_started', signal })}\n`,
    );
    const deadline = setTimeout(() => {
      process.stderr.write(
        'Worker shutdown grace expired; active jobs remain eligible for redelivery.\n',
      );
      process.exit(1);
    }, config.shutdownGraceMs);
    void runtime
      .close()
      .then(() => {
        clearTimeout(deadline);
        process.removeListener('SIGTERM', onSigterm);
        process.removeListener('SIGINT', onSigint);
      })
      .catch(() => {
        clearTimeout(deadline);
        process.exitCode = 1;
      });
  };
  const onSigterm = (): void => stop('SIGTERM');
  const onSigint = (): void => stop('SIGINT');
  process.on('SIGTERM', onSigterm);
  process.on('SIGINT', onSigint);
}

if (process.env['NODE_ENV'] !== 'test') {
  void bootstrap().catch(() => {
    // Configuration errors are intentionally generic; env values are never printed.
    process.stderr.write('Worker startup failed. Check server configuration and dependencies.\n');
    process.exitCode = 1;
  });
}
