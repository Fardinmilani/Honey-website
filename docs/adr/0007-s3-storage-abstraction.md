# ADR-0007: S3-compatible storage behind a port; MinIO locally

**Status:** Accepted · **Date:** 2026-08-04 · **Phase:** 1

## Context

Product imagery, generated derivatives, invoices, and data exports must live
outside the application containers — containers are disposable and horizontally
scaled, so a local filesystem is not shared state. The hosting provider is not
finally chosen, so we must not couple to one vendor's SDK.

## Decision

A `StorageService` port in the domain layer, with an S3-compatible adapter.

```ts
interface StorageService {
  put(key: string, body: Buffer | Readable, opts: PutOptions): Promise<StoredObject>;
  getSignedUrl(key: string, opts: SignOptions): Promise<string>;   // short TTL
  getSignedUploadUrl(key: string, opts: UploadOptions): Promise<PresignedUpload>;
  delete(key: string): Promise<void>;
  copy(from: string, to: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}
```

- MinIO locally, any S3-compatible provider in production. Same API, same code
  path, no `if (isLocal)` anywhere.
- Buckets: `honey-media` (CDN-fronted), `honey-private` (invoices, exports —
  signed access only), `honey-backups` (write-and-list credentials, no delete).
- Uploads go **direct to storage** via short-lived pre-signed URLs; the API never
  proxies bytes.
- Storage keys are server-generated UUID paths. The user's filename is metadata,
  never a path component.
- An in-memory fake adapter passes the same contract test suite as the real one.

## Consequences

**Positive** — provider-portable; local development is realistic without cloud
credentials; direct uploads keep large files off the API; signed URLs give
private documents time-limited access without an auth proxy; the fake makes
storage-dependent tests fast and hermetic.

**Negative / accepted** — MinIO and managed providers differ at the edges
(consistency, lifecycle rules, event notifications), so provider-specific
behaviour must be covered by integration tests against the real target before
launch; pre-signed uploads mean validation happens *after* the bytes land, so the
media worker verifies and quarantines rather than rejecting at the door; another
service in the local stack.

**Explicitly excluded:** the Hero media. Those eight files ship inside the web
image as static assets and never enter object storage — see
[ADR-0019](0019-hero-media-preservation.md).

## Alternatives considered

| Option | Why not |
|---|---|
| Local filesystem volume | Not shared across replicas; lost on container replacement; no CDN story |
| Vendor SDK used directly | Couples the domain to a provider and makes tests need the network |
| Storing images in Postgres | Bloats the database and its backups; no CDN; terrible cache behaviour |
| A media SaaS (Cloudinary and similar) | Attractive transformations, but vendor lock-in and per-asset cost for a catalog we control |
