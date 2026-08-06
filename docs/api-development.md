# API development

The NestJS/Fastify composition root exposes operational routes, the Phase 6
identity API, the Phase 7 staff media API, and the Phase 8 public/admin catalog
API. Identity, storage, upload, catalog, persistence, ownership, and permission
rules remain in
`packages/backend`; controllers map DTOs, cookies, request principals, and
OpenAPI only. See [`identity-development.md`](identity-development.md) and
[`media-development.md`](media-development.md), and
[`catalog-development.md`](catalog-development.md) for the complete flows.

## Prerequisites and environment

Use Node.js `22.17.0`, pnpm `11.20.0`, and the local PostgreSQL 16 service. Copy
`.env.example` to the ignored `.env`, start infrastructure, apply the committed
database migration, and then start the API:

```powershell
Copy-Item .env.example .env
pnpm docker:up
pnpm docker:verify
pnpm db:migrate
pnpm api:dev
```

On Linux or macOS use `cp .env.example .env`. The start scripts load the root
`.env` when it exists. The API defaults to
`127.0.0.1:4000` outside production. Configuration is validated before boot;
production requires explicit HTTPS API/upload origins, HTTPS storage endpoints,
trusted-proxy policy, secure host-bound CSRF cookie settings, non-placeholder
storage credentials, and every other documented value. Unknown
hosting variables are tolerated, but malformed known variables stop startup.
Never put production credentials in `.env.example` or a command line.

Do not print `DATABASE_URL` in logs or diagnostics.

## Health and readiness

```text
http://127.0.0.1:4000/healthz
http://127.0.0.1:4000/readyz
```

`/healthz` proves the process is alive, never queries PostgreSQL, and returns
`200` with `Cache-Control: no-store`. `/readyz` makes a bounded `SELECT 1`
through `@honey/backend` and `@honey/db`; it returns `200` only while PostgreSQL
is reachable and otherwise returns a sanitized `503 application/problem+json`.
Neither endpoint requires business or seed data.

Every response echoes a valid `X-Request-Id`; invalid or absent incoming values
are replaced. Structured request logs include service/environment metadata,
method, route template, status, duration, and request ID. Bodies, raw query
strings, cookies, authorization, CSRF tokens, credentials, and personal data are
not logged; sensitive fields are explicitly redacted.

## Validation and errors

Malformed JSON returns `400`. Structurally valid DTO input with invalid or
unknown properties returns `422`. Errors use RFC 9457 problem details with a
stable machine code and request ID; stacks, SQL, Prisma, configuration, and
dependency details are never returned. Phase 5 includes a test-only validation
route that is absent from production composition and OpenAPI.

The global transport limit returns `429` with `Retry-After` and rate-limit
headers. Identity additionally uses Redis-backed, concurrency-safe per-IP and
per-identity exponential lockout. CSRF constant-time double-submit validation is
active for unsafe requests whenever the session cookie is present.

## OpenAPI workflow

```sh
pnpm api:openapi:generate
pnpm api:openapi:check
pnpm api:openapi:lint
pnpm api:openapi:forbidden
pnpm api:openapi:breaking --base-file path/to/base-openapi.json
```

Generation writes the deterministic OpenAPI 3.1 document and TypeScript types.
The check command fails on committed drift. Breaking comparison must use the
pull-request base document; an unchanged document passes and operation removal
fails. No deployed API or network lookup is involved.

## Tests and image

With PostgreSQL already healthy:

```sh
pnpm api:test
pnpm api:test:integration
pnpm phase5:verify
pnpm phase6:verify
pnpm phase7:verify
pnpm api:docker:build
```

The API image is intentionally not added to the default local Compose profile.
To run it manually, attach it to the existing infrastructure network and supply
production-safe environment values, including a container-reachable
`DATABASE_URL` whose host is `postgres`:

```powershell
docker run --rm --name honey-api --network honey-local-internal -p 4000:4000 `
  --env-file .env honey-api:phase7
```

The runtime image uses the non-root `node` user, `tini` as PID 1, and a
`/readyz` health check. `docker stop --time 15 honey-api` sends SIGTERM. Nest
stops accepting new requests, drains within `API_SHUTDOWN_GRACE_MS`, closes the
database resource, logs the bounded lifecycle, and exits; a hung shutdown is
forced only after the deadline.

## Troubleshooting

- Port conflict: change `API_PORT` and the published Docker port, or stop the
  process already listening on 4000. On PowerShell use
  `Get-NetTCPConnection -LocalPort 4000` to inspect it.
- Invalid configuration: the startup error names invalid keys but never their
  values. Compare those keys with `.env.example`; production does not accept
  wildcard origins, arbitrary proxy trust, insecure CSRF cookies, or omitted
  required values.
- Readiness is `503`: confirm `pnpm docker:status`, run `pnpm docker:verify`,
  check that migrations were applied, and ensure `DATABASE_URL` uses
  `127.0.0.1` from the host or `postgres` from the Docker network.
- Health is `200` but readiness is `503`: the API process is alive and the
  PostgreSQL dependency is unavailable or exceeded its bounded timeout.
- Direct upload signature mismatch: keep `S3_INTERNAL_ENDPOINT` reachable from
  the API and `S3_BROWSER_ENDPOINT` reachable from the browser; do not replace a
  signed host after authorization is created.
