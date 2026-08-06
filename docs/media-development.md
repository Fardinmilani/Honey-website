# Media and storage development

Phase 7 implements transport-independent storage and media rules in
`packages/backend/src/modules/media`. The API owns only DTO validation,
permission declarations, request mapping, OpenAPI metadata, and response
mapping. It imports no storage SDK, image processor, Prisma API, or database
package.

There is no media management UI, Next.js media workflow, product attachment
route, background processor, or video transcoding in this phase. The eight Hero
files under `apps/web/public/media/hero/` remain static, byte-identical, and
absent from object storage.

## Buckets and endpoints

| Purpose | Bucket | Access |
|---|---|---|
| Public verified media | `honey-media` | Anonymous reads locally; writes require S3 credentials |
| Quarantine and private media | `honey-private` | Private; reads require a short-lived signed URL |

`S3_INTERNAL_ENDPOINT` is the address the API process uses for storage
operations. `S3_BROWSER_ENDPOINT` is embedded in presigned browser
authorizations. They are both `http://localhost:9000` for a host-run API, but a
containerized API normally uses `http://minio:9000` internally while continuing
to sign the browser-reachable address. `PUBLIC_MEDIA_BASE_URL` includes the
public bucket path and is the only source for public response URLs.

Local MinIO accepts direct-upload CORS requests only from the explicit
`MEDIA_UPLOAD_ALLOWED_ORIGINS` value, which defaults to
`http://localhost:3000`. Production configuration must use explicit HTTPS
origins and HTTPS storage endpoints. Wildcard origins are rejected.

## Direct-upload lifecycle

1. A staff session with `content:write` requests an upload intent.
2. The backend validates the intended type, intended size, visibility, and
   localized alt text.
3. The backend creates random upload and candidate asset UUIDs and the private
   key `quarantine/{uploadId}/original`.
4. Redis stores the owner-bound intent for 600 seconds. The presigned POST is
   valid for 300 seconds and constrains the private bucket, exact key, declared
   content type, and byte range.
5. The future browser client posts directly to MinIO/S3. The API never receives
   the complete body.
6. The owner calls the completion route. Redis atomically moves `PENDING` to
   `PROCESSING`; another owner receives the same not-found result as a missing
   intent.
7. Storage metadata and a bounded 8 KiB prefix are read. The backend verifies
   the actual object size and signature. A version tag binds subsequent reads to
   the inspected object.
8. Invalid bytes are deleted from quarantine. Valid images are re-encoded and
   derived; valid video containers are retained unchanged.
9. Trusted outputs receive SHA-256 checksums, safe content metadata, immutable
   UUID keys, and are written to the selected final bucket.
10. `MediaAsset` and `MediaDerivative` are persisted atomically by the media
    repository. The identity module then appends a redacted audit event, Redis
    records the completed asset ID, the quarantine object is deleted, and retries
    return the existing asset. If audit persistence fails after the media row is
    durable, the intent remains `PROCESSING`; a retry finds that asset, retries
    the audit, and completes without regenerating media.

If final persistence fails, every promoted key created by that attempt receives
a bounded deletion attempt and the source remains private in quarantine. If
invalid-object deletion itself fails, completion returns a dependency failure
rather than pretending cleanup succeeded. Operational lifecycle cleanup should
remove expired quarantine prefixes after the intent TTL; no scheduled cleanup
processor exists in Phase 7.

## Accepted content and limits

Type is derived from bytes, never from the filename, extension, or client
`Content-Type`.

| Kind | Accepted signatures | Default byte limit |
|---|---|---:|
| Image | JPEG, PNG, WebP, AVIF | 15 MiB |
| Video original | MP4, WebM | 100 MiB |

Images are additionally limited to 40,000,000 decoded pixels, 12,000 pixels in
width, and 12,000 pixels in height. Sharp receives the decoded-pixel limit before
metadata and output work. Processing has a 30-second application timeout and is
sequential with bounded Sharp cache and concurrency.

SVG/XML, HTML, scripts, PDF, archives, PE and ELF executables, shell scripts,
unknown signatures, and misleading renamed files are rejected. An SVG is
rejected even after leading whitespace or an XML declaration and regardless of
the declared type.

All values are configurable with bounded, validated environment variables. See
`.env.example`; malformed or unsafe production media configuration prevents API
startup.

## Image processing and derivatives

Image orientation is applied before output. Sharp re-encodes the canonical
original and does not copy EXIF, GPS, ICC, or arbitrary source metadata. Tests
generate a synthetic JPEG with non-personal GPS coordinates, prove the input has
EXIF, and prove the canonical output and every derivative decode with no EXIF.

The fixed `honey-v1` profile is intentionally small:

| Variant | Maximum width | Format | Quality | Resize policy |
|---|---:|---|---:|---|
| `thumb` | 320 | WebP | 80 | inside, preserve ratio, no enlargement |
| `card` | 720 | WebP | 82 | inside, preserve ratio, no enlargement |
| `hero` | 1440 | WebP | 84 | inside, preserve ratio, no enlargement |
| `og` | 1200 | JPEG | 86 | inside, preserve ratio, no enlargement |

Each trusted output has its own dimensions, byte count, MIME type, and SHA-256
checksum. The matrix is deterministic; Phase 7 does not create an unbounded
width/format product.

MP4 and WebM receive byte-limit and container-signature verification only. They
are not transcoded, do not receive derivatives or adaptive streams, and retain a
null duration when it cannot be determined safely.

## Alt text

`altTextByLocale` accepts a dynamic map of canonical BCP-47 locale keys to NFC
plain text. Values are trimmed, must contain 1–300 Unicode characters, preserve
Persian RTL text, and reject tags, entities, control characters, duplicate
canonical locales, and invalid language tags. Incomplete locale coverage is
allowed in Phase 7. Catalog publishing owns any later all-enabled-locale rule.

## Public and private retrieval

Public responses contain canonical URLs derived from the configured public base
and persisted server-generated key. The API never streams public object bytes.
Verified objects use the trusted `Content-Type`, inline disposition, and
immutable caching because every path is UUID-versioned. MinIO serves the public
bucket with anonymous read-only access and denies anonymous writes.

Private responses contain no public URL. `POST /v1/admin/media/{assetId}/private-url`
first authorizes `content:write`, loads the private asset by ID, derives its
persisted server key, and returns a signed URL valid for 120 seconds. There is no
route or DTO for arbitrary keys or buckets. Signed URLs and credentials are not
written to audit events or application logs.

## API routes

Every route is versioned, staff-only, permission-protected, and subject to the
existing cookie CSRF protection for unsafe methods.

| Method | Route | Operation |
|---|---|---|
| POST | `/v1/admin/media/upload-intents` | Create direct-upload authorization |
| POST | `/v1/admin/media/upload-intents/{uploadId}/complete` | Verify, process, promote, persist |
| GET | `/v1/admin/media/{assetId}` | Read safe metadata |
| PATCH | `/v1/admin/media/{assetId}/alt-text` | Replace localized alt text |
| POST | `/v1/admin/media/{assetId}/private-url` | Sign the persisted private original |
| DELETE | `/v1/admin/media/{assetId}` | Delete an unattached asset |

The database foreign key prevents deletion of an attached asset without the
media repository reading catalog tables. Product attachment endpoints remain
absent.

## Tests

```sh
pnpm --filter @honey/backend test -- --run test/media.test.ts test/storage.fake.contract.test.ts

# Requires the Phase 3 Docker services and only touches unique Phase 7 prefixes.
MEDIA_MINIO_TESTS=true pnpm --filter @honey/backend test -- --run \
  test/storage.minio.contract.test.ts \
  test/media.minio.integration.test.ts \
  test/media.integration.test.ts

pnpm --filter @honey/api test -- --run test/media.test.ts
pnpm phase7:verify
```

The same storage contract suite runs against the in-memory adapter and MinIO.
The fake uses an injected clock and never accesses disk or the network. MinIO
tests upload only unique test keys and delete only keys they created. They list
both buckets to fail if a Hero-related object exists; they never delete an
unrelated object found by that check.

## Windows and Docker troubleshooting

- If the browser authorization points at `minio:9000`, set
  `S3_BROWSER_ENDPOINT=http://localhost:9000`; `minio` is a Docker network name,
  not a browser address.
- If an API container cannot reach `localhost:9000`, set its internal endpoint
  to `http://minio:9000` while leaving the browser endpoint unchanged.
- After changing the explicit local CORS origin, recreate only the MinIO
  container configuration with `docker compose up -d --force-recreate minio`,
  wait for health, then rerun `minio-init`. Do not remove volumes.
- On Windows, execute the repository commands from PowerShell. The committed
  initializer retains LF endings inside its Linux container mount.
- A signature mismatch usually means the browser endpoint, path-style setting,
  region, or host differs between signing and upload.
- A 403 public read indicates the idempotent initializer has not applied the
  anonymous download policy to the public bucket.
