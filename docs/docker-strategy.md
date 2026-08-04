# Docker Strategy

**Goal:** one command brings up a complete, production-shaped local environment;
the same image definitions produce small, non-root, reproducible production
containers.

**Decision record:** [ADR-0023](adr/0023-self-hosted-vps-deployment.md),
[ADR-0006](adr/0006-redis-bullmq.md),
[ADR-0007](adr/0007-s3-storage-abstraction.md),
[ADR-0021](adr/0021-shared-backend-package.md)

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
| `api` | built from `docker/api.Dockerfile` | 3001 | source bind | HTTP composition root, watch mode |
| `worker` | built from `docker/worker.Dockerfile` | — | source bind | BullMQ composition root, watch mode |
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

The `api` and `worker` images both build `packages/backend` and differ only in
their entrypoint and which workspace they build last
([ADR-0021](adr/0021-shared-backend-package.md)). Scoped builds use
`pnpm deploy --filter` (or `turbo prune`) so each image ships only the workspace
subgraph it needs rather than the whole monorepo.

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

## 7. Production topology — self-hosted VPS

The initial production target is a **single self-hosted Linux VPS running Docker
Compose behind a reverse proxy with TLS**, provider-neutral and portable to
managed services later ([ADR-0023](adr/0023-self-hosted-vps-deployment.md)).

```
                         Internet
                            │
                 ┌──────────▼─────────────────────────────┐
                 │ Reverse proxy — Caddy or Nginx          │  TLS + auto-renewal,
                 │ THE ONLY CONTAINER WITH PUBLISHED PORTS │  HSTS, security headers,
                 └───┬──────────────────────────────┬─────┘  brotli, edge rate limiting
                     │                              │
           ┌─────────▼──┐                    ┌──────▼──────┐    ┌──────────────┐
           │    web     │                    │     api     │    │    worker    │
           │ standalone │───── private ─────▶│ Nest/Fastify│    │    BullMQ    │
           └────────────┘                    └──────┬──────┘    └──────┬───────┘
                                                    │  both host       │
                                             ┌──────▼──────────────────▼──────┐
                                             │      packages/backend           │
                                             └──────┬──────────────────────────┘
                     ┌──────────────────────────────┼──────────────┐
              ┌──────▼─────┐  ┌────────┐  ┌─────────▼────┐         │
              │ PostgreSQL │  │ Redis  │  │    MinIO     │         │
              │  + WAL     │  │ + AOF  │  │ S3-compatible│         │
              └──────┬─────┘  └────────┘  └──────────────┘         │
                     │                                             │
                     └──── encrypted, off-host ────────────────────┘
                                     ▼
                        Object storage in a DIFFERENT account
                        nightly dumps · WAL archive · media backup
```

All services share a private Docker network. Only the reverse proxy publishes
ports; PostgreSQL, Redis, and MinIO are unreachable from the internet.

**Why self-hosted first.** Predictable cost, no vendor lock-in before we have
operational data to choose with, full control over data residency in the primary
market, and near-identical local and production topologies. The trade is that we
own patching, backups, monitoring, and recovery — which is why the Phase 20
acceptance criteria are written around a rehearsed restore rather than a
configured one.

**Portability is a design constraint.** Every stateful dependency sits behind a
standard protocol or a port, so moving one to a managed service is a
connection-string change: object storage via `StorageService`
([ADR-0007](adr/0007-s3-storage-abstraction.md)), PostgreSQL and Redis over the
wire. No code may assume co-location, a local filesystem, a shared in-process
cache, or a single instance of any application container.

**Production differences from local**

| Aspect | Local | Production (VPS) |
|---|---|---|
| Object storage | MinIO container | MinIO container; managed S3 + CDN is the first planned migration |
| Mail | Mailpit, nothing leaves | Real transactional provider |
| TLS | Plain HTTP on localhost | Enforced at the proxy, auto-renewed, HSTS preload |
| Exposed ports | Convenient direct ports | Reverse proxy only |
| Data | Seeded synthetic | Real, backed up off-host, restore-tested |
| Replicas | 1 of each | 1 of each; `worker` scales by process concurrency |
| Deploys | `pnpm dev` | Readiness-gated rolling restart, brief downtime per service |
| Migrations | `pnpm db:migrate` by hand | Separate pre-deploy job |
| Logs | Pretty-printed to stdout | Structured JSON shipped centrally |
| Secrets | `.env` file | Injected at runtime, never in an image layer |

**Single-node consequences.** No read replica: reporting and admin exports run
against the primary with a generous `statement_timeout`. Deploys are brief-
downtime rolling restarts rather than zero-downtime. The VPS is a single point of
failure, accepted at launch volume, with a tested restore as the mitigation
rather than a hot standby.

**Resource limits** — every production container declares CPU and memory limits.
On one shared host this matters more than usual: a runaway container must not
starve PostgreSQL. Node's heap is capped below the container limit
(`--max-old-space-size`) so the process fails with a debuggable JS heap error
rather than an opaque OOM kill.

---

## 8. Deployment sequence

```
1. CI builds and pushes immutable, digest-tagged images
2. Pull images on the VPS; fail the deploy here if a pull fails, before anything
   is stopped
3. Pre-deploy job: run migrations (expand phase only — backwards-compatible)
4. Recreate api    → readiness-gated
5. Recreate worker → SIGTERM first, active jobs drain, then replace
6. Recreate web    → readiness-gated
7. Post-deploy smoke: /readyz, a catalog read in each locale, a synthetic
   checkout in staging
8. Contract migrations (drops) ship in a later release, never with the expand
```

On a single node each recreate is a short downtime window for that service rather
than a zero-downtime rolling deploy; the reverse proxy holds or retries during
the gap. Pulling before stopping (step 2) is what keeps a registry problem from
turning into an outage.

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

**Backups must leave the host.** Self-hosting co-locates the database with the
applications it serves ([ADR-0023](adr/0023-self-hosted-vps-deployment.md)), so a
dump written to a local volume dies with the machine it was protecting. Every
backup target above is off-host object storage in a different account, including
the MinIO bucket contents themselves.

Monthly restore drill: provision a throwaway host, restore the latest dump, run
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
