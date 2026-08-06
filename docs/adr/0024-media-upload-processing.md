# ADR-0024: Quarantined direct uploads with synchronous bounded media processing

**Status:** Accepted · **Date:** 2026-08-06 · **Phase:** 7

## Context

ADR-0007 requires direct S3-compatible uploads behind a provider-neutral port,
but a presigned upload is not a trusted media asset. The browser controls the
filename, declared type, and uploaded bytes. Phase 7 also needs a processing
seam that a later worker can call without moving media rules into a transport.

## Decision

- A short-lived, owner-bound upload intent is stored in Redis. It is temporary,
  atomic, single-processing, idempotently completable state rather than a
  permanent database record. Unit tests use an in-memory implementation with an
  injected clock.
- Every direct upload lands at a server-generated UUID quarantine key in the
  private bucket. The API never accepts a bucket or object key and never proxies
  the uploaded body.
- Completion inspects bounded bytes, determines the type by signature, enforces
  actual byte and decoded-image limits, then invokes a transport-independent
  media processing service in `packages/backend`.
- Images are orientation-corrected and re-encoded without arbitrary metadata.
  Four deterministic derivatives are generated sequentially: `thumb` 320 WebP,
  `card` 720 WebP, `hero` 1440 WebP, and `og` 1200 JPEG. Resizing preserves aspect
  ratio and does not enlarge a smaller source.
- MP4 and WebM may be signature-verified and retained as originals. Phase 7 does
  not transcode them, create derivatives, or infer duration when it cannot be
  determined safely.
- Only verified outputs are promoted and then persisted. If persistence fails,
  promoted outputs receive bounded deletion attempts while the original remains
  isolated in private quarantine for operational recovery. Invalid objects are
  deleted immediately. Successfully persisted assets make completion retries
  return the same asset rather than creating duplicates.
- Public media uses immutable UUID keys and a configured canonical public base
  URL. Private media is reachable only by an authorized, short-lived signed URL
  created from the persisted asset ID; callers never supply a storage key.

## Consequences

The request process performs bounded image work in Phase 7, so large processing
throughput is intentionally limited. The application service is transport
independent and can be invoked unchanged by the Phase 16 worker. Redis loss can
invalidate an unfinished upload intent, but cannot turn quarantined bytes into a
trusted asset. Public-object deletion after a database failure is best-effort;
the private quarantine original remains the recovery source and immutable key
prefixes make orphan reconciliation deterministic.

The existing Hero files remain protected in-repository static assets. Key
validation, tests, and verification exclude Hero-related paths from both storage
buckets.

## Alternatives considered

| Option | Why not |
|---|---|
| Upload complete files through the API | Increases request memory and bandwidth and violates ADR-0007 |
| Trust the browser type or extension | Both are attacker-controlled and provide no content assurance |
| Store upload intents in PostgreSQL | Temporary TTL state is not a permanent business record |
| Start a queue processor now | Worker processors belong to Phase 16 |
| Generate every size and format combination | Creates unused storage and processing work without a catalog use case |
