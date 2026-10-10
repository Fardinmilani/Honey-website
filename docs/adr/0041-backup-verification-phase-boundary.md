# ADR-0041: Separate backup-verification orchestration from its verifier

**Status:** Accepted · **Date:** 2026-10-05 · **Phase:** 16

## Context

Phase 16 originally required a repeatable backup-verification job, while Phase 20
owns the production backup system, off-host storage, and restore drills. The
Phase 16 capability audit found no existing verifier to call. Scheduling a job
that reports success without checking a backup would hide this gap.

## Decision

Phase 16 provides the versioned job contract, application port, processor,
retry/dead-letter and metrics plumbing, and capability-gated schedule. The
capability is disabled until Phase 20 supplies a concrete verifier adapter.
Startup reports this deferred state explicitly. Phase 20 activates the schedule
only after backup infrastructure and the verifier exist and are tested.

## Consequences

The worker can be released without pretending backups are verified. Phase 20
must implement the verifier and prove that enabling the schedule runs a real
check. Phase 16 cannot claim operational backup verification.

## Alternatives considered

| Option | Why not |
|---|---|
| Pull production backup infrastructure into Phase 16 | Crosses the phase boundary and requires deployment and retention decisions owned by Phase 20 |
| Schedule a no-op or successful fake | Would falsely report recoverability |
| Drop the job contract entirely | Would leave Phase 20 without the accepted orchestration boundary |
