export type QueueConnection = Readonly<{
  host: string;
  port: number;
  username?: string;
  password?: string;
  db: number;
  maxRetriesPerRequest: null;
  enableOfflineQueue: false;
  connectTimeout: number;
  retryStrategy: (attempt: number) => number;
  tls?: Readonly<Record<string, never>>;
}>;

export function redisConnectionOptions(redisUrl: string): QueueConnection {
  const parsed = new URL(redisUrl);
  const database =
    parsed.pathname === '' || parsed.pathname === '/' ? 0 : Number(parsed.pathname.slice(1));
  if (!Number.isSafeInteger(database) || database < 0 || database > 15) {
    throw new Error('Invalid worker Redis database.');
  }
  return {
    host: parsed.hostname,
    port: parsed.port === '' ? 6379 : Number(parsed.port),
    ...(parsed.username === '' ? {} : { username: decodeURIComponent(parsed.username) }),
    ...(parsed.password === '' ? {} : { password: decodeURIComponent(parsed.password) }),
    db: database,
    maxRetriesPerRequest: null,
    enableOfflineQueue: false,
    connectTimeout: 5_000,
    retryStrategy: (attempt: number) => Math.min(5_000, Math.max(250, attempt * 250)),
    ...(parsed.protocol === 'rediss:' ? { tls: {} } : {}),
  };
}

/** Producers must fail a command promptly; blocking consumers use their own connection. */
export function producerConnectionOptions(redisUrl: string) {
  return { ...redisConnectionOptions(redisUrl), maxRetriesPerRequest: 1 };
}
