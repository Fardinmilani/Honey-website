# ADR-0013: Payment provider port; the webhook is the source of truth

**Status:** Accepted · **Date:** 2026-08-04 · **Phase:** 1

## Context

The payment provider is not chosen yet (see [`PLANS.md §6`](../../PLANS.md)) and
will change: Iranian PSPs use redirect-then-verify flows, international providers
use intents and hosted fields, and a business may need both. Meanwhile, payment
state is the single most attractive thing on the site to forge — a `?status=success`
query parameter is entirely under the attacker's control.

## Decision

**A port, not an SDK dependency.**

```ts
interface PaymentProvider {
  readonly code: string;
  readonly capabilities: { redirect; capture; partialRefund; webhooks };
  createPayment(input): Promise<CreatePaymentResult>;   // → providerRef, redirectUrl?
  verifyReturn(input): Promise<PaymentOutcome>;         // server-side verification
  capture?(input): Promise<PaymentOutcome>;
  refund(input): Promise<RefundOutcome>;
  parseWebhook(raw): Promise<VerifiedWebhookEvent>;     // verifies the signature
  getStatus(providerRef): Promise<PaymentOutcome>;      // reconciliation
}
```

Adapters live in `payments/infrastructure/providers/<code>/`. No vendor type
crosses a module boundary. A fake adapter passes the same contract test suite.

**Trust rules, in priority order:**

1. The **webhook** is the durable source of truth.
2. A browser redirect back from the PSP triggers a server-side `verifyReturn` —
   the redirect itself is an untrusted hint, never a state change.
3. A **reconciliation job** polls `getStatus` for payments stuck in `PENDING`, so
   a dropped webhook cannot strand an order.

**Webhook handling** — verify the signature against the **raw body**, check the
timestamp window (≤ 5 min), deduplicate on a unique provider event id, persist
the raw payload, return `200` immediately, then process asynchronously and
idempotently.

**Amount check** — the captured amount must equal `order.grandTotalMinor`. A
mismatch does **not** mark the order paid; it raises a reconciliation alert.

## Consequences

**Positive** — adding or replacing a PSP is one adapter plus configuration;
payment tests run without network access; a forged success parameter achieves
nothing; a dropped webhook is recovered automatically; card data never touches
our infrastructure.

**Negative / accepted** — the port must be general enough for redirect and intent
flows without becoming a lowest-common-denominator that hides useful
provider features, so `capabilities` is explicit and provider-specific data is
confined to `providerPayload` JSONB; asynchronous webhook processing means a
brief window where the customer has paid and the order still says pending, which
the UI handles by polling; three code paths (return, webhook, reconciliation) all
converge on the same idempotent state machine and all three need tests.

## Alternatives considered

| Option | Why not |
|---|---|
| Integrate one PSP directly | Provider change becomes a refactor of the orders domain |
| Trust the redirect return | Trivially forgeable; the most common serious e-commerce vulnerability |
| Process webhooks synchronously before responding | PSPs time out fast and retry aggressively; slow processing looks like failure and multiplies duplicate deliveries |
| Poll only, no webhooks | Latency and load; a customer waiting on a confirmation screen |
| A payment aggregator SaaS | Another vendor dependency and margin, for abstraction we can own in one interface |
