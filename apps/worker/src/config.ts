export type WorkerConfig = Readonly<{
  environment: 'development' | 'test' | 'production';
  databaseUrl: string;
  redisUrl: string;
  redisPrefix: string;
  webOrigin: string;
  revalidationSecret: string;
  shutdownGraceMs: number;
  outboxIntervalMs: number;
  reservationSweepIntervalMs: number;
  paymentReconcileIntervalMs: number;
  inventoryReconcileIntervalMs: number;
  sitemapRegenerateIntervalMs: number;
  outboxBatchSize: number;
  reservationBatchSize: number;
  paymentBatchSize: number;
  payment: Readonly<{
    provider: 'mock' | 'zarinpal';
    callbackUrl: string;
    requestTimeoutMs: number;
    reconciliationMinAgeMs: number;
    zarinpal: Readonly<{
      merchantId: string;
      mode: 'sandbox' | 'production';
      accessToken: string | null;
    }>;
  }>;
  smtp: Readonly<{
    host: string;
    port: number;
    secure: boolean;
    from: string;
    connectionTimeoutMs: number;
  }>;
}>;

function value(environment: NodeJS.ProcessEnv, key: string, fallback?: string): string {
  const candidate = environment[key] ?? fallback;
  if (candidate === undefined || candidate.trim() === '') {
    throw new Error(`Invalid worker configuration: ${key} is required.`);
  }
  return candidate.trim();
}

function integer(
  environment: NodeJS.ProcessEnv,
  key: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = environment[key] ?? String(fallback);
  if (!/^[0-9]+$/u.test(raw)) throw new Error(`Invalid worker configuration: ${key}.`);
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`Invalid worker configuration: ${key}.`);
  }
  return parsed;
}

function url(valueInput: string, protocols: readonly string[], name: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(valueInput);
  } catch {
    throw new Error(`Invalid worker configuration: ${name}.`);
  }
  if (!protocols.includes(parsed.protocol) || parsed.hostname === '') {
    throw new Error(`Invalid worker configuration: ${name}.`);
  }
  return parsed;
}

export function loadWorkerConfig(environment: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const nodeEnv = environment['NODE_ENV'] ?? 'development';
  if (nodeEnv !== 'development' && nodeEnv !== 'test' && nodeEnv !== 'production') {
    throw new Error('Invalid worker configuration: NODE_ENV.');
  }
  const databaseUrl = value(environment, 'DATABASE_URL');
  url(databaseUrl, ['postgresql:', 'postgres:'], 'DATABASE_URL');
  const redisUrl = value(environment, 'REDIS_URL');
  url(redisUrl, ['redis:', 'rediss:'], 'REDIS_URL');
  const webOrigin = value(environment, 'WORKER_WEB_ORIGIN', 'http://localhost:3000');
  const parsedOrigin = url(webOrigin, ['http:', 'https:'], 'WORKER_WEB_ORIGIN');
  if (
    parsedOrigin.origin !== webOrigin ||
    parsedOrigin.username !== '' ||
    parsedOrigin.password !== '' ||
    (nodeEnv === 'production' && parsedOrigin.protocol !== 'https:')
  ) {
    throw new Error('Invalid worker configuration: WORKER_WEB_ORIGIN.');
  }
  const revalidationSecret = value(environment, 'WEB_REVALIDATE_SECRET');
  if (revalidationSecret.length < 16) {
    throw new Error('Invalid worker configuration: WEB_REVALIDATE_SECRET.');
  }
  const redisPrefix = value(environment, 'WORKER_QUEUE_PREFIX', 'honey-worker');
  if (!/^[a-z][a-z0-9-]{2,39}$/u.test(redisPrefix)) {
    throw new Error('Invalid worker configuration: WORKER_QUEUE_PREFIX.');
  }
  if (
    environment['BACKUP_VERIFICATION_ENABLED'] !== undefined &&
    environment['BACKUP_VERIFICATION_ENABLED'] !== 'false'
  ) {
    throw new Error('Backup verification requires the Phase 20 concrete verifier adapter.');
  }
  const provider = value(environment, 'PAYMENT_PROVIDER', 'mock');
  if (provider !== 'mock' && provider !== 'zarinpal') {
    throw new Error('Invalid worker configuration: PAYMENT_PROVIDER.');
  }
  if (nodeEnv === 'production' && provider === 'mock') {
    throw new Error('Invalid worker configuration: PAYMENT_PROVIDER.');
  }
  const callbackUrl = value(
    environment,
    'PAYMENT_CALLBACK_URL',
    'http://localhost:3000/fa/checkout/payment-return',
  );
  url(callbackUrl, ['http:', 'https:'], 'PAYMENT_CALLBACK_URL');
  const zarinpalMode = value(environment, 'ZARINPAL_MODE', 'sandbox');
  if (zarinpalMode !== 'sandbox' && zarinpalMode !== 'production') {
    throw new Error('Invalid worker configuration: ZARINPAL_MODE.');
  }
  const merchantId = environment['ZARINPAL_MERCHANT_ID']?.trim() ?? '';
  if (provider === 'zarinpal' && merchantId === '') {
    throw new Error('Invalid worker configuration: ZARINPAL_MERCHANT_ID.');
  }
  const smtpSecure = environment['IDENTITY_SMTP_SECURE'] ?? 'false';
  if (smtpSecure !== 'true' && smtpSecure !== 'false') {
    throw new Error('Invalid worker configuration: IDENTITY_SMTP_SECURE.');
  }
  const smtpFrom = value(environment, 'IDENTITY_EMAIL_FROM');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(smtpFrom)) {
    throw new Error('Invalid worker configuration: IDENTITY_EMAIL_FROM.');
  }
  return {
    environment: nodeEnv,
    databaseUrl,
    redisUrl,
    redisPrefix,
    webOrigin,
    revalidationSecret,
    shutdownGraceMs: integer(environment, 'WORKER_SHUTDOWN_GRACE_MS', 30_000, 1_000, 120_000),
    outboxIntervalMs: integer(environment, 'WORKER_OUTBOX_INTERVAL_MS', 5_000, 1_000, 300_000),
    reservationSweepIntervalMs: integer(
      environment,
      'WORKER_RESERVATION_SWEEP_INTERVAL_MS',
      60_000,
      5_000,
      3_600_000,
    ),
    paymentReconcileIntervalMs: integer(
      environment,
      'WORKER_PAYMENT_RECONCILE_INTERVAL_MS',
      60_000,
      5_000,
      3_600_000,
    ),
    inventoryReconcileIntervalMs: integer(
      environment,
      'WORKER_INVENTORY_RECONCILE_INTERVAL_MS',
      86_400_000,
      60_000,
      604_800_000,
    ),
    sitemapRegenerateIntervalMs: integer(
      environment,
      'WORKER_SITEMAP_REGENERATE_INTERVAL_MS',
      3_600_000,
      60_000,
      86_400_000,
    ),
    outboxBatchSize: integer(environment, 'WORKER_OUTBOX_BATCH_SIZE', 100, 1, 500),
    reservationBatchSize: integer(environment, 'WORKER_RESERVATION_BATCH_SIZE', 100, 1, 500),
    paymentBatchSize: integer(environment, 'WORKER_PAYMENT_BATCH_SIZE', 100, 1, 500),
    payment: {
      provider,
      callbackUrl,
      requestTimeoutMs: integer(
        environment,
        'PAYMENT_PROVIDER_REQUEST_TIMEOUT_MS',
        8_000,
        500,
        30_000,
      ),
      reconciliationMinAgeMs:
        integer(environment, 'PAYMENT_RECONCILIATION_MIN_AGE_SECONDS', 300, 1, 86_400) * 1_000,
      zarinpal: {
        merchantId,
        mode: zarinpalMode,
        accessToken: environment['ZARINPAL_ACCESS_TOKEN']?.trim() || null,
      },
    },
    smtp: {
      host: value(environment, 'IDENTITY_SMTP_HOST'),
      port: integer(environment, 'IDENTITY_SMTP_PORT', 1025, 1, 65_535),
      secure: smtpSecure === 'true',
      from: smtpFrom,
      connectionTimeoutMs: integer(environment, 'IDENTITY_SMTP_TIMEOUT_MS', 5_000, 500, 30_000),
    },
  };
}
