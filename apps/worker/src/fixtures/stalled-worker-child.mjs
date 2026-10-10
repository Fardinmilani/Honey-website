import { Worker } from 'bullmq';

const [redisUrl, prefix, effectKey, deliveryKey] = process.argv.slice(2);
if (!redisUrl || !prefix || !effectKey || !deliveryKey) {
  throw new Error('Missing isolated worker fixture parameters.');
}
const parsed = new URL(redisUrl);
const worker = new Worker(
  'inventory',
  async () => {
    const client = await worker.client;
    client.defineCommand('phase16ApplyOnce', {
      numberOfKeys: 2,
      lua: "redis.call('INCR', KEYS[2]); return redis.call('SETNX', KEYS[1], 'applied')",
    });
    await client.runCommand('phase16ApplyOnce', [effectKey, deliveryKey]);
    process.stdout.write('ACTIVE\n');
    await new Promise(() => undefined);
  },
  {
    connection: {
      host: parsed.hostname,
      port: Number(parsed.port || '6379'),
      ...(parsed.username ? { username: decodeURIComponent(parsed.username) } : {}),
      ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
      maxRetriesPerRequest: null,
    },
    prefix,
    concurrency: 1,
    lockDuration: 1_000,
    stalledInterval: 500,
    maxStalledCount: 2,
  },
);
worker.on('error', () => {
  process.stderr.write('Fixture worker error.\n');
});
await worker.waitUntilReady();
