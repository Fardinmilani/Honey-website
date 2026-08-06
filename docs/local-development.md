# Local Development Environment

Phase 3 provides the infrastructure stack. Phase 4 adds the Prisma schema,
committed migration, deterministic development seed, and disposable database
integration harness. Phase 5 adds the NestJS/Fastify API and backend platform
foundation. Phase 6 uses PostgreSQL for opaque sessions/audit, Redis for
authentication lockout and pre-auth challenges, and Mailpit for local identity
mail. Phase 7 uses Redis for owner-bound upload intents and MinIO for private
quarantine, verified public media, and signed private retrieval. The API remains
outside the default Compose profile and no UI exists yet. Phase 8 uses the same
Redis service for short-lived, locale-scoped catalog response caching; reads
fall back to PostgreSQL when Redis is unavailable and mutations still require
successful persistence before invalidation is attempted.

## Prerequisites

- Node.js `22.17.0`
- pnpm `11.20.0` through Corepack
- Docker Engine with Docker Compose v2
- Docker Desktop on Windows or macOS

On Windows, use Docker Desktop with its WSL2 backend. WSL2 is strongly
recommended because the services run as Linux containers and its filesystem and
network behavior are closer to production than Windows containers.

Confirm the tools are available:

```sh
docker version
docker compose version
pnpm --version
```

## Pinned service images

The local stack uses published, non-floating tags from the official image
publishers. The tags were verified with `docker manifest inspect` on 2026-08-05.

| Service | Image |
|---|---|
| PostgreSQL | `postgres:16.14-alpine3.23` |
| Redis | `redis:7.4.10-alpine3.21` |
| MinIO server | `minio/minio:RELEASE.2025-09-07T16-13-09Z` |
| MinIO client | `minio/mc:RELEASE.2025-08-13T08-35-41Z` |
| Mailpit | `axllent/mailpit:v1.30.6` |

PostgreSQL remains on major version 16 and Redis remains on major version 7.
Changing either major version requires an explicit architecture decision.

## First startup

Copy the safe example values into the untracked local environment file:

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Linux/macOS:

```sh
cp .env.example .env
```

The example credentials are deliberately non-production placeholders. They are
only suitable for a developer workstation. Replace them in `.env` if the
machine is shared, never commit `.env`, and never reuse local credentials in
staging or production.

Start the stack:

```sh
pnpm docker:up
```

`docker:up` first validates the effective Compose configuration and then starts
all services in detached mode. The one-shot `minio-init` service waits for MinIO
to become healthy, creates the required buckets, applies their policies, and
exits successfully.
MinIO itself receives the explicit local direct-upload CORS origin through
`MINIO_API_CORS_ALLOW_ORIGIN`; no wildcard origin is configured.

Wait for all services and required resources to be ready:

```sh
pnpm docker:verify
```

The verification has a 120-second bounded health wait. On failure it prints
service state and recent logs instead of assuming that startup completed.

## Services and ports

All published ports bind to `127.0.0.1` and can be overridden in `.env`.

| Service | Container port | Default host port | Variable | Purpose |
|---|---:|---:|---|---|
| PostgreSQL | 5432 | 5432 | `POSTGRES_PORT` | relational database |
| Redis | 6379 | 6379 | `REDIS_PORT` | local cache/state service |
| MinIO API | 9000 | 9000 | `MINIO_PORT` | S3-compatible API |
| MinIO console | 9001 | 9001 | `MINIO_CONSOLE_PORT` | browser administration |
| Mailpit SMTP | 1025 | 1025 | `MAILPIT_SMTP_PORT` | local SMTP catcher |
| Mailpit UI | 8025 | 8025 | `MAILPIT_UI_PORT` | captured-message UI |

The containers use the explicitly named internal bridge network
`honey-local-internal`. Persistent data lives in the named volumes
`honey-local-postgres-data`, `honey-local-redis-data`,
`honey-local-minio-data`, and `honey-local-mailpit-data`.

## Everyday commands

| Command | Behavior |
|---|---|
| `pnpm docker:up` | validate Compose and start the stack in detached mode |
| `pnpm docker:down` | stop containers and remove the network while preserving volumes |
| `pnpm docker:status` | display all Compose service states, including `minio-init` |
| `pnpm docker:logs` | follow logs for all services; stop following with `Ctrl+C` |
| `pnpm docker:verify` | wait for health and verify extensions, buckets, policies, HTTP, and SMTP |
| `pnpm docker:reset` | interactively destroy all local service volumes after exact confirmation |

To inspect only one service:

```sh
docker compose logs --follow postgres
docker compose ps -a
```

To stop the stack without deleting data:

```sh
pnpm docker:down
```

## PostgreSQL verification

Confirm that PostgreSQL accepts connections:

```sh
docker compose exec postgres sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

List the four required extensions:

```sh
docker compose exec postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT extname FROM pg_extension ORDER BY extname;"'
```

The result must contain `citext`, `pg_trgm`, `pgcrypto`, and `unaccent`.
`pnpm docker:verify` performs the same check and exits nonzero if any extension
is missing.

The initialization file only enables extensions. It creates no application
tables, extra users, seed data, or business record. Prisma migrations create the
application schema separately.

## Database development

With PostgreSQL healthy, validate and generate the Prisma client, apply the
committed migration, and seed deterministic development fixtures:

```sh
pnpm db:validate
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm db:migrate:status
```

The seed refuses production mode and non-local database hosts. Set
`SEED_STAFF_EMAIL` to a synthetic local address. `SEED_STAFF_PASSWORD_HASH` is
optional; when omitted, the seeded staff fixture has no usable credential.

Run the database-level integration suite with:

```sh
pnpm db:test
```

The harness connects through `TEST_DATABASE_ADMIN_URL`, creates a unique
`honey_phase4_test_*` database, applies the complete migration history, runs the
seed twice, proves database rejection of invalid rows and mutations, and drops
only that temporary database in a `finally` path. It never resets or drops
`POSTGRES_DB` or the database named by `DATABASE_URL`.

## API development

With PostgreSQL healthy and the migration applied, `pnpm api:dev` starts the API
on `127.0.0.1:4000`. Its `/healthz` endpoint is process-only; `/readyz` depends
on a bounded PostgreSQL check. The root `.env` is loaded when present.

The focused runbook is [`api-development.md`](api-development.md). It covers
configuration, request IDs and logging, RFC 9457 errors, validation, OpenAPI,
tests, the standalone API image, graceful shutdown, PowerShell, and common
failure modes.

The identity-specific setup, cookies, customer/staff flows, Mailpit inspection,
and deterministic test behavior are documented in
[`identity-development.md`](identity-development.md).
Media endpoint addressing, direct uploads, limits, and focused tests are in
[`media-development.md`](media-development.md).

## Redis verification

```sh
docker compose exec redis redis-cli ping
```

Expected output:

```text
PONG
```

Redis uses append-only persistence with `appendfsync everysec` in its named
volume. Local Redis authentication is intentionally not enabled because the
active local architecture does not require it and the port binds only to the
loopback interface.

## MinIO verification

Check the server health endpoint:

```sh
curl --fail http://localhost:9000/minio/health/live
```

List buckets with the pinned MinIO client service:

```sh
docker compose run --rm --no-deps --entrypoint /bin/sh minio-init -c 'mc alias set local "$MINIO_ENDPOINT" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null && mc ls local'
```

The default buckets are:

- `honey-media`, configured by `MINIO_PUBLIC_BUCKET`, with anonymous read-only
  (`download`) access for local development
- `honey-private`, configured by `MINIO_PRIVATE_BUCKET`, with no anonymous access

No bucket allows anonymous write access. Re-running the one-shot initializer is
safe and proves idempotency:

```sh
docker compose run --rm minio-init
```

The host-run API uses `S3_INTERNAL_ENDPOINT=http://localhost:9000` and
`S3_BROWSER_ENDPOINT=http://localhost:9000`. A container-run API uses
`http://minio:9000` internally but must continue signing the browser-reachable
host endpoint. Direct uploads land only in the private quarantine bucket. The
public bucket serves only verified immutable outputs.

Open the MinIO console at <http://localhost:9001> and sign in with the local
`MINIO_ROOT_USER` and `MINIO_ROOT_PASSWORD` from `.env`.

The protected Hero files under `apps/web/public/media/hero/` are never copied to
MinIO. They remain static in-repository application assets.

## Mailpit verification

Open the captured-message UI at <http://localhost:8025>. The readiness endpoint
is <http://localhost:8025/readyz>.

Mailpit listens for SMTP on `localhost:1025`. The Phase 6 identity-only SMTP
adapter uses these local values:

```text
MAILPIT_SMTP_HOST=localhost
MAILPIT_SMTP_PORT=1025
IDENTITY_SMTP_HOST=localhost
IDENTITY_SMTP_PORT=1025
```

Mailpit stores captured local messages in its named volume so container restarts
do not discard them. This is developer-only data.

## Safe reset

Normal shutdown preserves data. Use reset only when a clean local database,
Redis store, object store, and mail store are intentionally required:

```sh
pnpm docker:reset
```

The command prints a destructive warning and requires an interactive terminal.
It runs `docker compose down --volumes` only after the exact phrase
`delete local docker volumes` is entered. Any other response cancels the reset.

**Volume deletion is permanent.** It removes all local PostgreSQL, Redis, MinIO,
and Mailpit data. There is no automatic backup or recovery for developer data.

## Personal Compose overrides

`docker-compose.override.yml` is ignored by Git and may be used for local-only
changes such as alternative host ports. Do not put credentials in a tracked
Compose file. Example:

```yaml
services:
  postgres:
    ports:
      - "127.0.0.1:55432:5432"
```

Prefer changing the documented port variables in `.env`; use an override only
when Compose-level customization is necessary.

## Inspecting the effective configuration

Validate and render the configuration after `.env` interpolation and local
overrides:

```sh
docker compose config --quiet
docker compose config
```

The rendered output contains local placeholder credentials. Treat terminal logs
and screenshots accordingly even though these values are not production
secrets.

## Troubleshooting

### Port conflicts

If a port is already in use, change its host-side variable in `.env`, then run
`pnpm docker:up` again. Do not change container ports. On Windows, inspect ports
with `Get-NetTCPConnection`; on Linux/macOS, use `lsof -i` or `ss -ltn`.

### Docker Desktop and WSL2

On Windows, confirm Docker Desktop is running, is using Linux containers, and
has WSL2 integration enabled for the distribution that contains the checkout.
If the Docker client cannot reach the daemon, restart Docker Desktop and check
`wsl --status` and `docker context show`. The expected context is normally
`desktop-linux`.

### Unhealthy containers

Inspect state and recent logs:

```sh
pnpm docker:status
docker compose logs --tail 100 postgres redis minio mailpit minio-init
docker inspect --format '{{json .State.Health}}' "$(docker compose ps -q minio)"
```

Common causes are stale data created by an incompatible local image, invalid
values in `.env`, insufficient Docker Desktop memory, or a host port conflict.
Do not delete volumes until the logs are reviewed and the data loss is accepted.

### CRLF in shell scripts on Windows

`docker/local/minio/init-buckets.sh` must use LF line endings. The repository's
`.gitattributes` and `.editorconfig` enforce LF. If a container reports `not
found` or shows `^M`, configure the editor to save LF and re-check the file with:

```sh
git check-attr eol -- docker/local/minio/init-buckets.sh
```

The Compose entrypoint invokes `/bin/sh` explicitly, so no PowerShell syntax or
Windows executable bit is required inside the Linux container.
