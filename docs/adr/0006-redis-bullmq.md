# ADR-0006: Redis + BullMQ with a separate worker process

**Status:** Accepted · **Date:** 2026-08-04 · **Phase:** 1

## Context

Sending an order confirmation, generating an invoice, sweeping expired
reservations, reconciling payments, and regenerating sitemaps must not happen
inside an HTTP request. Doing them inline makes checkout slow and makes a
provider outage look like a checkout failure. We also need sessions, rate-limit
counters, idempotency keys, and short-lived caches.

## Decision

Redis 7 for ephemeral state and queues; BullMQ for job processing; a dedicated
`apps/worker` process for consumption.

- Queues: `outbox`, `email`, `sms`, `inventory`, `orders`, `payments`, `media`,
  `search`, `cache`, `maintenance`.
- The worker shares `packages/db` and the API's application services — it does not
  re-implement business rules.
- Every handler is **idempotent**; delivery is at-least-once and redeliveries
  will happen.
- Deterministic `jobId` for deduplication; exponential backoff with jitter;
  bounded attempts, then dead-letter with an alert and a `JobFailure` record.
- Redis runs with AOF `everysec` so queue state survives a restart.
- **Transactional outbox**: events are written in the same transaction as the
  state change and dispatched after commit.

## Consequences

**Positive** — fast, predictable request latency; retries and backoff come free;
the worker scales on queue depth independently of traffic; the outbox makes
"order created but email never sent" structurally impossible; Redis is already
needed for sessions and rate limits, so no new dependency.

**Negative / accepted** — Redis becomes critical infrastructure that needs
persistence and monitoring; at-least-once delivery puts the idempotency burden on
every handler; job payload schemas are a versioning problem across deploys, so
payloads are validated on consumption; a second process to deploy, observe, and
shut down gracefully.

## Alternatives considered

| Option | Why not |
|---|---|
| Postgres-based queue (pgboss / SKIP LOCKED) | One less dependency, but Redis is already required and BullMQ's scheduling, rate limiting, and observability are far ahead |
| In-process jobs in the API | Lost on restart; couples request latency to provider latency; cannot scale separately |
| Managed queue (SQS and similar) | Cloud lock-in, worse local development, more moving parts for our scale |
| Cron on the host | No retries, no visibility, no backpressure |
