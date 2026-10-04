# Payments development

Phase 14 money path. Payment state changes only from provider-verified
server-to-server evidence ([ADR-0022](adr/0022-payment-verification-sources.md)).
The browser may start a payment or return from the gateway; it can never declare
success.

## Provider contract

`PaymentProvider` lives in `packages/backend` and declares honest
`capabilities`. `getStatus` is mandatory. Every other method is optional and
must match the official provider surface — never a guessed webhook or a faked
partial refund.

| Capability | Fake provider | Zarinpal REST v4 |
|---|---|---|
| `redirect` | yes | yes (`/pg/StartPay/{authority}`) |
| `verifyReturn` | yes | yes (`/pg/v4/payment/verify.json`) |
| `getStatus` | yes | yes (`inquiry.json`, then `verify.json` only when inquiry is `PAID`) |
| `webhooks` | optional | **no** — do not invent one |
| `capture` | no | no |
| `refund` | yes | yes when `ZARINPAL_ACCESS_TOKEN` is set (`/pg/v4/payment/refund.json`) |
| `partialRefund` | optional | **no** — official REST refund is full-only |

Official sources used for the adapter (retrieved 2026-09-25 / rechecked
2026-10-04):

- https://www.zarinpal.com/docs/paymentGateway/connectToGateway
- https://www.zarinpal.com/docs/paymentGateway/otherMethods/Inquiry
- https://www.zarinpal.com/docs/paymentGateway/sandBox

Amounts are integer Iranian rials (`IRR`). There is no Toman conversion in
application code. `card_pan` and other card data are never stored.

Production fails closed: `PAYMENT_PROVIDER=mock` is forbidden, the callback URL
must be HTTPS, and Zarinpal must use a real merchant id in `production` mode.

## Fake provider

`FakePaymentProvider` is in-memory and deterministic. Tests drive it with
`setOutcome`. When `webhooks: true` it signs bodies with
`FAKE_WEBHOOK_SECRET` (test-only) and rejects a missing/invalid signature or a
timestamp older than five minutes. CI never calls the live Zarinpal network.

## Lifecycle

1. Owner is derived from the session or guest cart cookie.
2. The order must be `PENDING_PAYMENT` / `UNPAID`.
3. Amount and currency come from `Order.grandTotalMinor` — never the client.
4. `Payment` + `PaymentAttempt` are written, then the provider `createPayment`
   call runs **outside** the row lock.
5. The customer is redirected. Return, webhook (if declared), and `getStatus`
   all call the same `applyPaymentOutcome`.

A `FAILED` / `CANCELLED` / `EXPIRED` payment does **not** release Phase 13
allocation. The order stays `PENDING_PAYMENT` / `UNPAID` and is retryable.
Stock is released only by order cancellation, not by a declined payment.

### Transition table (`decideTransition`)

| Current | Outcome | Result |
|---|---|---|
| `CREATED` / `PENDING` / `AUTHORIZED` | `PENDING` / `AUTHORIZED` | apply only if rank moves forward |
| non-terminal | `PAID` / `FAILED` / `CANCELLED` / `EXPIRED` | apply |
| `PAID` | any | no-op |
| `FAILED` / `CANCELLED` / `EXPIRED` | `PAID` | apply (reconciliation recovery) |
| `FAILED` / `CANCELLED` / `EXPIRED` | other | no-op |
| `REFUNDED` / `PARTIALLY_REFUNDED` | any provider outcome | no-op |

Duplicate `providerTxnRef` values do not write a second `PaymentTransaction`.

## Return, webhook, reconciliation

- Return: parse only `paymentId`. Ignore `?status=success`. Call `verifyReturn`
  with the stored `providerRef` / amount / currency.
- Webhook: raw body, signature, timestamp window, unique `(provider, eventId)`,
  persist `ProviderEvent`, then `processProviderEvent`. Phase 16 will move the
  processing step onto BullMQ; Phase 14 keeps the application-service seam.
- `getStatus` / `reconcile` / `reconcileEligible` are transport-independent.
  There is no scheduler in this phase.

Mismatch of amount, currency, or `providerRef` never marks paid. It writes
`payment.amount_mismatch` audit + `payment.reconciliation_mismatch` outbox.

## Refunds

`POST /v1/admin/payments/:paymentId/refunds` requires `order:refund` and a
recent TOTP step-up. The server caps the amount at remaining refundable. Zarinpal
rejects partials. Refunds do not restock inventory. The order grand total stays
immutable.

## PCI / redaction

No PAN, CVV, or card form exists in the storefront. Provider adapters persist
only redacted `{ code, message }` summaries. Callback URLs are built from
`PAYMENT_CALLBACK_URL`, never from `Host`.

## BFF / UI

Allow-listed BFF routes under `/api/bff/payments` forward CSRF on writes. The
smallest real UI is a **Pay now** action on an unpaid order and a localized
result page that renders **verified** status only.

Phase 14 release-readiness verification completed 2026-10-04. Phase 16 still
owns reconciliation scheduling and BullMQ consumers. Phase 15 has not started.
