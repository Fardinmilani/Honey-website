export const paymentsModuleMetadata = {
  name: 'payments',
  tables: ['payment', 'payment_attempt', 'payment_transaction', 'refund', 'provider_event'],
  queues: [],
  events: [
    'payment.created',
    'payment.paid',
    'payment.failed',
    'payment.refunded',
    'payment.partially_refunded',
    'payment.reconciliation_mismatch',
  ],
  publicRoutes: ['/v1/payments/*', '/webhooks/payments/*'],
} as const;
