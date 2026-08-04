# ADR-0023: Initial deployment target is a self-hosted Linux VPS with Docker Compose

**Status:** Accepted · **Date:** 2026-08-05 · **Phase:** 1 (correction)
**Refines:** [ADR-0007](0007-s3-storage-abstraction.md)

## Context

Phase 1 left the hosting target open and, in places, assumed managed PostgreSQL,
managed Redis, and a managed object-storage provider. That assumption leaks into
real decisions — backup mechanism, connection pooling, replica topology, the
Docker strategy, and the Phase 3 local environment — so leaving it open blocks
Phase 3 and quietly biases the design toward a cloud vendor we have not chosen.

The business is a single-brand store at launch volume. It needs to be running,
observable, and recoverable. It does not need multi-region failover, and it
should not be locked to one cloud provider's control plane before there is any
operational experience to justify the choice.

## Decision

**The initial production deployment target is a self-hosted Linux VPS running
Docker Compose behind a reverse proxy with TLS.**

- **Compute:** one Linux VPS (any provider), running `web`, `api`, `worker`,
  PostgreSQL, Redis, and MinIO as Docker Compose services on a private network.
- **Ingress:** a reverse proxy (Caddy or Nginx) terminating TLS with automatic
  certificate renewal, applying HSTS, the security headers from
  [`security-model.md §6`](../security-model.md), compression, and edge rate
  limiting. It is the only container with published ports.
- **Provider-neutral:** nothing in the application depends on a specific cloud
  vendor's API, identity system, or managed service. The deployment is defined by
  `docker-compose.prod.yml` and files under `docker/prod/`, both tracked in git.
- **Portable by construction:** every stateful dependency already sits behind an
  interface or a standard protocol — PostgreSQL over the wire, Redis over the
  wire, and object storage behind the `StorageService` port
  ([ADR-0007](0007-s3-storage-abstraction.md)). Moving any one of them to a
  managed service later is a connection-string and credential change, not a code
  change.

### Migration path, recorded now so it stays true

| Step | Trigger | Change required |
|---|---|---|
| Managed object storage + CDN | Media bandwidth or backup durability | Swap the S3 endpoint and credentials. No code change |
| Managed PostgreSQL | Backup/PITR burden, or the need for a replica | Change `DATABASE_URL`; migrate with `pg_dump`/restore |
| Managed Redis | Memory pressure or persistence burden | Change `REDIS_URL` |
| Horizontal scaling / orchestrator | One VPS saturates | Apps are already stateless containers; add an orchestrator and replicas |

Keeping that path cheap is a **design constraint**, not an aspiration: no code
may assume co-location, a local filesystem, a shared in-process cache, or a
single instance of any application container.

### What this obligates us to own

Self-hosting moves work from a provider onto us, and the Phase 20 checklist
reflects it: OS patching and unattended security updates; PostgreSQL backups
(nightly `pg_dump -Fc` plus WAL archiving for PITR) written **off the VPS** to
object storage in a different account; a rehearsed and timed restore drill;
Redis AOF persistence for BullMQ durability; disk-space and resource-limit
monitoring; certificate renewal monitoring; and firewall rules that expose only
the reverse proxy.

Backups leaving the machine is the non-negotiable part. A backup stored on the
VPS it protects is not a backup.

### Single-node consequences to design around

- **No read replica initially.** Reporting and admin exports run against the
  primary with a generous `statement_timeout`, not against a replica. The
  documentation must not assume a replica exists.
- **Deploys are brief-downtime rolling restarts**, not zero-downtime rolling
  deploys. Migrations still follow expand → migrate → contract
  ([`database-strategy.md §7`](../database-strategy.md)) so a rollback never
  needs a down-migration.
- **The VPS is a single point of failure.** Accepted at launch volume; the
  mitigation is a tested restore, not a hot standby.

## Consequences

**Positive** — predictable low cost; no vendor lock-in before we have operational
data to choose with; local Docker Compose and production Docker Compose are
nearly the same topology, so "works locally" means considerably more than usual;
full control over configuration and data residency, which matters for the primary
market; Phase 3 is unblocked.

**Negative / accepted** — we own patching, backups, monitoring, and recovery, and
those are real recurring work rather than a one-time setup; a single node means a
hardware or host failure is an outage bounded by our restore time, not by a
failover; vertical scaling has a ceiling and we will meet it before a managed
setup would; no managed PITR tooling, so our own WAL archiving and restore drill
have to actually work, which is why the drill is a Phase 20 acceptance criterion
rather than a recommendation.

## Alternatives considered

| Option | Why not |
|---|---|
| Managed platform for `web` (Vercel and similar) + managed database | Fastest to stand up, but splits the deployment across vendors, complicates the private network between web and api, and locks in before we have any operational data |
| Kubernetes | Enormous operational surface for three containers at launch volume |
| Full managed cloud (RDS, ElastiCache, S3, ECS) | Highest cost and the deepest lock-in, bought before there is a scaling problem to solve |
| Serverless | Cold starts on a latency-sensitive checkout and connection-pool pressure on PostgreSQL (already rejected in [ADR-0002](0002-modular-monolith.md)) |
| Bare metal without containers | Loses local/production parity, which is the main reason the Docker strategy exists |
