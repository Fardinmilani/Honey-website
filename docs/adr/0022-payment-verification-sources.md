# ADR-0022: Payment state changes only on a server-verified provider outcome

**Status:** Accepted · **Date:** 2026-08-05 · **Phase:** 1 (correction)
**Supersedes:** [ADR-0013](0013-payment-provider-abstraction.md)

> ADR-0013 remains in the repository unchanged as the historical record. Its
> `PaymentProvider` port, its adapter structure, and its rule that the browser is
> never believed all still stand. This ADR replaces one thing: the claim that
> **the webhook** is the source of truth.

## Context

ADR-0013 named the webhook as the durable source of truth and treated
`verifyReturn` and reconciliation as recovery paths beneath it. That ranking
assumes every provider sends reliable webhooks.

Several Iranian payment providers do not. The common domestic pattern is
**redirect-then-server-verify**: the customer is sent to the gateway, returns to
our callback URL with an authority or token parameter, and the merchant then
makes a **server-to-server verify call** to confirm the outcome and capture the
amount. Webhooks may be absent, optional, unsigned, or delivered on a best-effort
basis. Writing "the webhook is the source of truth" into the architecture would
make the first domestic integration a documented exception on day one — and
exceptions to a security-critical rule are how the rule stops being followed.

The underlying safety property was never really about webhooks. It is about
**who** asserts the outcome: our server talking to the provider, or the customer's
browser.

## Decision

**Payment state changes only in response to an outcome that our server obtained
from the provider through a server-to-server channel.**

### 1. The browser is never trusted

Redirect query parameters, fragments, form posts, referrer values, and any
client-supplied `status`, `amount`, or `paid` field are **untrusted input**. A
return from the gateway is a *signal that it is time to verify*, never a state
change. A forged return achieves nothing beyond triggering a verification that
returns the real, unchanged outcome.

### 2. Three equally valid verification sources

A payment outcome is authoritative if it arrives by any of these, and **none is
required to exist** for a given provider:

| # | Source | Applies when |
|---|---|---|
| 1 | **Verified webhook** — signature-checked against the raw body, timestamp within tolerance, deduplicated by provider event id | The provider supports signed webhooks |
| 2 | **Server-side `verifyReturn`** — an outbound server-to-server verify/confirm call made after the customer returns | The provider uses redirect-then-verify. The common Iranian pattern |
| 3 | **Reconciliation `getStatus`** — a scheduled outbound poll for payments not in a terminal state | Always available; the backstop for every provider |

Source 3 is mandatory for every adapter. Sources 1 and 2 are declared per
provider through `PaymentProvider.capabilities`. A provider that supports
neither webhooks nor a return-verify call is not integrable and is rejected at
selection time.

### 3. One idempotent state machine

All three paths call the **same** `applyPaymentOutcome(outcome)` function. There
is no webhook-specific path, no redirect-specific path, and no
reconciliation-specific path through the state machine.

- Transitions are idempotent: applying the same terminal outcome twice is a no-op.
- Transitions are monotonic: a terminal state is never walked back by a late
  message. A `PAID` payment is not un-paid by a stale `PENDING` poll.
- Every application is recorded as a `PaymentTransaction` with its source, so an
  auditor can see which channel asserted the outcome and when.
- Concurrent arrivals (a webhook and a poll landing together) are serialized by a
  row lock on the payment; the second sees the first's result and does nothing.

### 4. What must be verified before state changes

Every outcome, from every source, is checked against the payment record:

- **Provider reference** — the outcome's `providerRef` matches the `Payment` we
  created. An outcome that references an unknown payment is logged and rejected.
- **Amount** — the verified amount equals `order.grandTotalMinor` exactly.
- **Currency** — matches the order's currency. A currency mismatch is never a
  rounding question; it is a defect or an attack.

A mismatch on any of these does **not** mark the order paid. It records
`payment.amount_mismatch`, raises a reconciliation alert, and leaves the payment
in its prior state for human resolution. Silently accepting a payment for the
wrong amount is worse than an alert.

## Consequences

**Positive** — domestic redirect-then-verify providers are first-class rather than
an exception; the safety property is stated in terms of *who asserts the outcome*,
which is the thing that actually matters and does not need revising per provider;
one state machine means one place to get idempotency and monotonicity right, and
one place to test them; `getStatus` being mandatory means no provider integration
can strand a payment.

**Negative / accepted** — a redirect-verify provider gives a slightly worse
experience when the customer closes the tab before returning, since the outcome
then waits for the reconciliation poll rather than a push (bounded by the poll
interval, which is tuned per provider); three entry points into one function is
more test surface than one, and all three need explicit tests; provider
capabilities must be declared honestly, and an adapter that over-claims webhook
support will fail in a way that only reconciliation catches.

## Alternatives considered

| Option | Why not |
|---|---|
| Keep "webhook is the source of truth" (ADR-0013) | False for providers we are most likely to integrate first; makes the first integration a documented exception |
| Trust the redirect return when a provider has no webhook | Client-supplied payment state. The single most damaging e-commerce vulnerability |
| Separate state machines per verification source | Three places to get idempotency wrong, and three sets of transition bugs |
| Poll-only for every provider | Wastes provider quota and delays confirmation where a webhook is genuinely available |
| Require webhook support from every provider | Would exclude viable domestic providers for an implementation detail |
