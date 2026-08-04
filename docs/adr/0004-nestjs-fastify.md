# ADR-0004: NestJS on Fastify for the API

**Status:** Accepted · **Date:** 2026-08-04 · **Phase:** 1

## Context

A modular monolith needs a framework with real module boundaries, dependency
injection (so ports can be swapped for fakes in tests), a guard/interceptor
pipeline for cross-cutting authorization and logging, and mature OpenAPI
generation. It also needs throughput good enough that the HTTP layer is never the
bottleneck.

## Decision

NestJS with the Fastify adapter.

- Nest modules map one-to-one onto the domain modules in
  [`module-boundaries.md`](../module-boundaries.md).
- DI wires `domain` ports to `infrastructure` adapters, so every external
  dependency has a test fake.
- Guards enforce authentication and permissions uniformly; a global pipe validates
  and rejects unknown properties; interceptors handle correlation ids, logging,
  and serialization.
- `@nestjs/swagger` generates the OpenAPI document that becomes the committed
  contract.
- Fastify over Express for roughly 2× throughput, native schema-based
  serialization, and better-typed plugins.

## Consequences

**Positive** — structure is enforced by the framework rather than by convention;
DI makes the port/adapter pattern natural instead of ceremonial; the guard
pipeline means authorization is declared once per route rather than remembered
per handler; OpenAPI generation is close to free.

**Negative / accepted** — decorator-heavy and opinionated, with a real learning
curve; some ecosystem packages assume Express and need Fastify equivalents;
raw-body access for webhook signature verification needs explicit Fastify
configuration and is easy to get wrong (so it gets an explicit test); the
framework encourages putting logic in services, which we counteract with the
four-layer module structure.

## Alternatives considered

| Option | Why not |
|---|---|
| Bare Fastify | We would rebuild DI, modules, guards, and OpenAPI generation ourselves |
| Express | Slower, weaker types, no structure |
| Next.js route handlers for everything | Couples business logic to the rendering framework; no DI; poor fit for the worker sharing services |
| Hono / Elysia | Excellent runtimes, but thin on the module and DI structure a modular monolith depends on |
