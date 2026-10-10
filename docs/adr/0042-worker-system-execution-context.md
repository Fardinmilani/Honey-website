# ADR-0042: Use a narrow system context for scheduled application work

**Status:** Accepted · **Date:** 2026-10-05 · **Phase:** 16

## Context

Inventory reconciliation already lives in a backend application service, but
its manual entry point requires an authorized staff principal. A worker has no
human session or user row. Forging a staff user would misstate who initiated
the operation; bypassing checks in the existing entry point would weaken API
authorization.

## Decision

The backend exposes a narrow, explicit `SYSTEM`/`WORKER` execution entry point
for scheduled reconciliation. It carries job correlation metadata, uses no fake
user, and calls the same application implementation as the staff path. The
existing staff permission check remains on the manual entry point. Other
application services do not inherit unrestricted system access.

## Consequences

Audit data distinguishes scheduled work from human actions while one domain
algorithm remains authoritative. Each future system entry point needs its own
review and test; possession of a worker process is not a generic admin grant.

## Alternatives considered

| Option | Why not |
|---|---|
| Insert a worker staff user | Creates a fake identity and misleading audit trail |
| Reconcile directly from the worker | Duplicates inventory rules and bypasses the application boundary |
| Relax the staff permission check | Would widen the API authorization surface |
