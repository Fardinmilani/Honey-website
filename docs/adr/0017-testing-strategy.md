# ADR-0017: Vitest + Playwright, with real dependencies in integration tests

**Status:** Accepted · **Date:** 2026-08-04 · **Phase:** 1

## Context

The behaviours most likely to cause real damage — overselling under concurrency,
a mis-summed order total, a missing authorization check, a replayed webhook — all
live at the boundary between application code and PostgreSQL or Redis. Tests that
mock the database prove that the mock behaves as written; they say nothing about
whether a row lock, a `CHECK` constraint, or a trigger actually fires.

## Decision

| Level | Tool | Scope |
|---|---|---|
| Unit | Vitest | Pure domain logic: `packages/core`, module `domain/`. No I/O |
| Integration | Vitest + **ephemeral Postgres and Redis containers** | Repositories, transactions, reservation concurrency, job handlers, authorization |
| Contract | Vitest | Handlers validated against the OpenAPI document; the document is diffed in CI |
| Component | Vitest + Testing Library | `packages/ui` and web components, rendered in **both** directions |
| End-to-end | Playwright | Critical journeys in `fa` and `en`, with axe accessibility checks |

**Rules**

- Integration tests run against a real database, migrated from scratch, with
  per-test transactional rollback for isolation.
- External providers (PSP, carrier, mail, storage) are exercised through **fakes
  that pass the same contract test suite as the real adapter** — never live in CI.
- Mandatory coverage, by behaviour rather than by percentage: the checkout
  transaction, concurrent reservation acquisition, price and rounding
  reconciliation, the full authorization matrix including negative cases, webhook
  signature verification and replay, and job idempotency under duplicate delivery.
- Every new endpoint requires an authorization test before review.
- **Tests are never weakened to pass.** A failing test is a finding.

## Consequences

**Positive** — the tests that matter exercise the mechanisms that matter,
including database constraints and lock behaviour; Vitest is fast and shares the
Vite config the web app already uses; Playwright covers RTL layout regressions
that unit tests cannot see; contract tests keep the frontend and backend honest;
adapter fakes make provider-dependent tests hermetic and quick.

**Negative / accepted** — integration tests need Docker available in CI and are
slower than mocked tests, so they are parallelized and scoped by `--filter`;
container startup adds fixed overhead per run; Playwright suites are the slowest
and most flake-prone part of CI, so they are kept to genuine critical journeys
rather than used as a general-purpose testing tool.

## Alternatives considered

| Option | Why not |
|---|---|
| Mock the database everywhere | Cannot catch constraint, trigger, lock, or transaction bugs — exactly the class we most fear |
| SQLite in tests, Postgres in production | Different constraint, locking, and type semantics; passing tests would prove nothing |
| Jest | Slower, extra configuration in an ESM/Vite workspace |
| Cypress | Weaker multi-browser and parallelism story than Playwright |
| A coverage-percentage gate | Rewards testing trivial code; behaviour requirements target the risk instead |
