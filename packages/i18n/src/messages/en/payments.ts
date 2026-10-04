import type { PaymentsMessages } from '../types.js';

export const payments = {
  payNow: 'Pay now',
  paying: 'Starting payment…',
  redirecting: 'Redirecting you to the payment provider…',
  resultTitle: 'Payment result',
  pending:
    'Payment is still being verified. This page will update when the server confirms the outcome.',
  paid: 'Payment verified. Your order is paid.',
  failed: 'Payment was not completed. You can try again if the order is still awaiting payment.',
  cancelled: 'Payment was cancelled. You can try again if the order is still awaiting payment.',
  expired:
    'This payment attempt expired. You can start a new payment if the order is still awaiting payment.',
  retry: 'Try payment again',
  providerUnavailable: 'The payment provider is temporarily unavailable. Please try again shortly.',
  genericError: 'We could not complete that payment step. Please try again.',
  returnToOrder: 'Return to order',
  statusLabel: 'Verified payment status',
} as const satisfies PaymentsMessages;
