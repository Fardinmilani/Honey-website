export type ReadinessStatus = Readonly<{
  status: 'ready';
  checks: Readonly<{ database: 'ready' }>;
}>;
