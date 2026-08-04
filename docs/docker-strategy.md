# Docker Strategy

**Goal:** one command brings up a complete, production-shaped local environment;
the same image definitions produce small, non-root, reproducible production
containers.

**Decision record:** [ADR-0006](adr/0006-redis-bullmq.md),
[ADR-0007](adr/0007-s3-storage-abstraction.md)

---

## 1. Principles

1. **Local parity where it matters.** Same Postgres major version, same Redis
   major version, same S3 API. Differences are deliberate and documented.
2. **Multi-stage builds.** Build tooling never ships in the runtime image.
3. **Non-root, read-only, minimal.** Least privilege in the container as well as
   in the application.
4. **No secrets in images.** Ever. Runtime injection only.
5. **Health-gated startup.** Nothing depends on a service until it is actually
   ready.
6. **Data lives in volumes**, and every one of those paths is gitignored.

---

## 2. Local topology

```
                        honey-net (bridge)
  ┌──────────┐  ┌──────────┐  ┌──────────┐
  │   web    │  │   api    │  │  worker  │      application (optional in Compose:
  │  :3000   │  │  :3001   │  │  no port │       many developers run these on the
  └────┬─────┘  └────┬─────┘  └────┬─────┘       host with pnpm dev)
       │             │             │
       └──────┬──────┴──────┬──────┘
              │             │
     ┌────────▼──────┐ ┌────▼─────────┐ ┌──────────────┐ ┌──────────────┐
     │  postgres:16  │ │   redis:7    │ │    minio     │ │   mailpit    │
     │    :5432      │ │    :6379     │ │ :9000 /:9001 │ │ :1025 /:8025 │
     │  vol: pgdata  │ │ vol: redisdt │ │ vol: miniodt │ │  (ephemeral) │
     └───────────────┘ └──────────────┘ └──────┬───────┘ └──────────────┘
                                               │
                                        ┌──────▼───────┐
                                        │  minio-init  │  one-shot: creates
                                        │  (mc client) │  buckets + policies
                                        └──────────────┘
```

### Services

| Service | Image | Ports | Volume | Purpose |
|---|---|---|---|---|
| `postgres` | `postgres:16-alpine` | 5432 | `pgdata` | System of record |
| `redis` | `redis:7-alpine` | 6379 | `redisdata` | Cache, sessions, BullMQ (`--appendonly yes`) |
| `minio` | `minio/minio` | 9000 API, 9001 console | `miniodata` | S3-compatible storage |
| `minio-init` | `minio/mc` | — | — | One-shot bucket + policy creation, then exits |
| `mailpit` | `axllent/mailpit` | 1025 SMTP, 8025 UI | — | Catches all outbound mail |
| `api` | built from `docker/api.Dockerfile` | 3001 | source bind | NestJS in watch mode |
| `worker` | built from `docker/worker.Dockerfile` | — | source bind | BullMQ consumers |
| `web` | built from `docker/web.Dockerfile` | 3000 | source bind | Next.js dev server |

Buckets created by `minio-init`: `honey-media` (public read via CDN in
production), `honey-private` (invoices, exports — signed access only),
`honey-backups`.

### File layout

```
docker/
├── api.Dockerfile
├── worker.Dockerfile
├── web.Dockerfile
├── postgres/init/01-extensions.sql      citext, pg_trgm, unaccent, pgcrypto
├── minio/init.sh                        buckets, policies, lifecycle
└── prod/                                production compose + proxy config  (TRACKED)
docker-compose.yml                       local development                  (TRACKED)
docker-compose.override.yml              personal overrides                 (IGNORED)
docker-compose.prod.yml                  production                         (TRACKED)
.data/                                   bind-mounted local volumes         (IGNORED)
```

`docker-compose.yml` and `docker-compose.prod.yml` are tracked; only
`docker-compose.override.yml` — the per-developer file — is ignored. Verified in
the Phase 1 gitignore run.

---

## 3. Health checks and start order

Every dependency declares a health check, and dependents wait for
`condition: service_healthy`. `depends_on` alone only waits for the container to
start, which is the classic cause of "connection refused" on the first boot.

| Service | Check |
|---|---|
| `postgres` | `pg_isready -U $POSTGRES_USER -d $POSTGRES_DB` |
| `redis` | `redis-cli ping` |
| `minio` | `curl -f http://localhost:9000/minio/health/live` |
| `minio-init` | exits `0` after creating buckets |
| `api` | `curl -f http://localhost:3001/readyz` |
| `web` | `curl -f http://localhost:3000/api/health` |

Startup order: `postgres` + `redis` + `minio` → `minio-init` → `api`
(runs migrations as an explicit step, not on import) → `worker` → `web`.

---

## 4. Developer workflow

```bash
cp .env.example .env
docker compose up -d postgres redis minio mailpit    # infrastructure only
pnpm db:migrate && pnpm db:seed
pnpm dev                                             # web + api + worker via turbo
```

The default recommendation is **infrastructure in Docker, applications on the
host**: fastest HMR, native debugger attachment, no bind-mount performance
penalty on Windows and macOS.

```bash
docker compose --profile full up      # everything containerized (CI-like)
```

Compose profiles keep both modes in one file. `full` is what CI and "works on my
machine" investigations use.

**Volume paths.** Named volumes by default. Where a bind mount is used for
inspection it points at `.data/`, which the root `.gitignore` excludes along with
`**/pgdata/`, `**/redis-data/`, `**/minio-data/`, `docker/data/`, and
`infra/docker/data/`.

**Windows note.** Bind-mounting `node_modules` from the host into a Linux
container is slow and breaks native modules. In `full` mode, `node_modules` lives
in an anonymous volume inside the container and only source is bind-mounted.

---

## 5. Image construction

Every application image follows the same four-stage shape:

```dockerfile
# 1. base   — pinned node:22-alpine (by digest), corepack pnpm, non-root user
# 2. deps   — copy manifests + lockfile only, pnpm install --frozen-lockfile
#             (this layer caches until dependencies actually change)
# 3. build  — copy source, pnpm build, prune to production dependencies
# 4. runner — copy only build output + production node_modules
#             USER node · read-only rootfs · tini as PID 1 · HEALTHCHECK
```

Rules:

- Base images pinned **by digest**, not by tag, and rebuilt weekly for patches.
- `.dockerignore` excludes `node_modules`, `.git`, `.next`, `dist`, `.env*`,
  `docs`, `.data`, and test artifacts — this is a build-speed *and* a
  secret-leak control.
- No secrets in `ARG` or `ENV`. Build-time credentials, if ever needed, use BuildKit
  secret mounts, which do not persist in layers.
- `NODE_ENV=production` in the runner stage.
- `tini` as PID 1 so `SIGTERM` reaches Node and shutdown is graceful.
- Turborepo remote cache and BuildKit layer cache in CI; the `deps` stage is the
  one that matters.
- Image size targets: api ≈ 200 MB, worker ≈ 180 MB, web ≈ 250 MB.

**Next.js** uses `output: 'standalone'` so the runner stage copies a
self-contained server plus `.next/static` and `public/` — including the hero
media, which ships **inside the image** as immutable static assets rather than
being fetched from object storage.

---

## 6. Graceful shutdown

On `SIGTERM`:

- **api** — stop accepting new connections, finish in-flight requests (grace
  30 s), close the Prisma and Redis pools, exit.
- **worker** — stop pulling new jobs, let active jobs finish (grace 60 s, longer
  than the longest expected job), let unfinished jobs return to the queue for
  redelivery, exit.
- **web** — drain, then exit.

Orchestrator `terminationGracePeriod` is set above each grace window. Because
every job handler is idempotent, a job interrupted by a redeploy is safe to
redeliver.

---

## 7. Production topology

```
                         Internet
                            │
                 ┌──────────▼──────────┐
                 │  CDN (media, static, ISR HTML)
                 └──────────┬──────────┘
                            │
                 ┌──────────▼──────────┐
                 │ Reverse proxy       │  TLS (auto-renew), HSTS,
                 │ Caddy or Nginx      │  security headers, gzip/brotli,
                 └───┬─────────────┬───┘  edge rate limiting
                     │             │
           ┌─────────▼──┐    ┌─────▼──────┐    ┌──────────────┐
           │  web × N   │    │  api × N   │    │  worker × M  │
           │ standalone │    │ Nest/Fastify│   │  BullMQ      │
           └────────────┘    └──┬──────┬──┘    └──────┬───────┘
                                │      │              │
                     ┌──────────▼─┐ ┌──▼──────┐ ┌─────▼────────┐
                     │ PostgreSQL │ │  Redis  │ │  S3-compat.  │
                     │  managed   │ │ managed │ │   storage    │
                     │  +replica  │ │  + AOF  │ │  + CDN       │
                     └────────────┘ └─────────┘ └──────────────┘
```

**Managed vs. self-hosted.** Postgres, Redis, and object storage are managed
services in production wherever available. Backups, patching, failover, and
point-in-time recovery are exactly the work we do not want to own by hand. If a
managed option is unavailable, `docker/prod/` contains a self-hosted definition
with the same interfaces, plus explicit backup and failover runbooks.

**Production differences from local**

| Aspect | Local | Production |
|---|---|---|
| Object storage | MinIO container | Managed S3-compatible + CDN |
| Mail | Mailpit, nothing leaves | Real transactional provider |
| TLS | Plain HTTP on localhost | Enforced, HSTS preload |
| Data | Seeded synthetic | Real, backed up, restore-tested |
| Replicas | 1 of each | Horizontally scaled, rolling deploys |
| Migrations | `pnpm db:migrate` by hand | Separate pre-deploy job |
| Logs | Pretty-printed to stdout | Structured JSON shipped centrally |
| Secrets | `.env` file | Secret manager, injected at runtime |

**Resource limits** — every production container declares CPU and memory limits
and requests. Node's heap is capped below the container limit
(`--max-old-space-size`) so the process fails with a JS heap error, which is
debuggable, rather than an opaque OOM kill.

---

## 8. Deployment sequence

```
1. CI builds and pushes immutable, digest-tagged images
2. Pre-deploy job: run migrations (expand phase only — backwards-compatible)
3. Rolling deploy api  → readiness-gated, one instance at a time
4. Rolling deploy worker → drains queues gracefully
5. Rolling deploy web  → readiness-gated
6. Post-deploy smoke: /readyz, a catalog read in each locale, a synthetic
   checkout in staging
7. Contract migrations (drops) ship in a later release, never with the expand
```

Rollback is a redeploy of the previous digest. It is always safe because
migrations within a release pair are backwards-compatible — no down-migration is
ever required.

---

## 9. Backups in the container world

| What | How | Where |
|---|---|---|
| Postgres continuous | WAL archiving (PITR) | Object storage, separate account/region |
| Postgres nightly | `pg_dump -Fc`, encrypted, from a scheduled job | `honey-backups` bucket |
| Pre-migration | Snapshot before every production migration | Retained 7 days |
| Object storage | Bucket versioning + lifecycle | Same provider, versioned |
| Redis | AOF `everysec` (BullMQ durability) | Cache data is rebuildable, not backed up |
| Configuration | Infrastructure-as-code in `infra/`, in git | Repository |

Backup jobs run in a dedicated container with credentials scoped to
write-and-list only — **no delete**. A compromised application credential
therefore cannot destroy the backups.

Monthly restore drill: provision a throwaway stack, restore the latest dump, run
migrations, run smoke tests, record the measured RTO. A drill that fails is a P1
incident. Details in [`database-strategy.md §10`](database-strategy.md).

---

## 10. What Docker is not used for

- **Not for CI test isolation primitives** — integration tests use ephemeral
  containers managed by the test harness, not the dev Compose stack.
- **Not for the hero media** — those eight files ship inside the web image as
  static assets. They are never uploaded to MinIO, never treated as user content,
  and never regenerated.
- **Not for secret storage** — no secrets in images, layers, or Compose files.
  `docker-compose.yml` reads from `.env`, which is never committed.
- **Not for state** — every container is disposable. All state is in Postgres,
  Redis, or object storage.
