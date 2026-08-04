# Database Strategy

**Engine:** PostgreSQL 16+
**Access:** Prisma ORM, exclusively via `packages/db`
**Owner:** `apps/api` and `apps/worker`. Nothing else has credentials.

---

## 1. Principles

1. **One database, one system of record.** No second engine until Postgres
   measurably cannot do the job ([ADR-0005](adr/0005-postgresql-prisma.md)).
2. **The database enforces the invariants it can.** Application checks are the
   friendly error; constraints are the guarantee.
3. **History is append-only.** Stock movements and order financials are never
   updated in place.
4. **Migrations are forward-only.** A mistake is fixed by a new migration.
5. **Locale is data.** Adding a language never requires a schema change.
6. **Index what you query, and nothing else.** Every index is justified by a real
   access path.

---

## 2. Conventions

| Concern | Convention |
|---|---|
| Table names | `snake_case`, singular (`order_line`, not `OrderLines`) |
| Prisma models | `PascalCase` with `@@map` to the snake_case table |
| Primary keys | `id uuid` — UUID v7, time-ordered for index locality |
| Human codes | Separate column: `order.number`, `harvest_batch.batch_code` |
| Money | `amount_minor bigint` + `currency char(3)`. Never `float`, never `numeric` for currency amounts |
| Rates | Basis points as `integer` (`tax_rate_bps = 900` → 9%) |
| Timestamps | `timestamptz`, UTC, `created_at` / `updated_at` on every mutable table |
| Enums | Postgres enums for closed domain sets; **never for locale or currency** |
| Booleans | Positive naming (`is_active`, not `is_not_disabled`) |
| Foreign keys | Always indexed, always with an explicit `ON DELETE` policy |
| JSONB | Only for snapshots, provider payloads, and localized blobs — never for queryable business state |
| Soft delete | `deleted_at timestamptz` only where history matters; hard delete elsewhere |

**Extensions:** `pgcrypto` (or app-side UUID v7), `citext` (email), `pg_trgm`
(fuzzy search), `unaccent` (Latin normalization), `btree_gin`.

---

## 3. Translation strategy

Sidecar tables, never JSON columns, for anything a customer reads or searches.

```sql
CREATE TABLE product_translation (
  id             uuid PRIMARY KEY,
  product_id     uuid NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  locale         text NOT NULL,          -- BCP-47, NOT an enum
  name           text NOT NULL,
  slug           text NOT NULL,
  short_description text,
  description    text,
  tasting_notes  text,
  meta_title     text,
  meta_description text,
  UNIQUE (product_id, locale),
  UNIQUE (locale, slug)
);
CREATE INDEX ON product_translation (locale, slug);
CREATE INDEX ON product_translation USING gin (name gin_trgm_ops);
```

Why sidecar tables rather than `name jsonb`:

- per-locale uniqueness on `slug` is a real constraint, and JSON cannot express it
- per-locale full-text and trigram indexes are possible
- adding a locale inserts rows; it never migrates a column
- partial translations are visible and reportable ("what still needs Persian?")

The same pattern applies to `category`, `collection`, `page`, `article`,
`faq_item`, `shipping_method`, and `apiary`.

**Order snapshots are the deliberate exception.** They store a JSONB map of all
locales captured at purchase time, because a snapshot must be frozen and
self-contained, not a live join.

---

## 4. Constraints that carry business rules

```sql
-- stock can never go negative
ALTER TABLE inventory_item
  ADD CONSTRAINT inventory_non_negative
  CHECK (on_hand >= 0 AND reserved >= 0 AND allocated >= 0);

-- sourcing is exactly one of own-production or selected-supplier
ALTER TABLE harvest_batch
  ADD CONSTRAINT harvest_batch_sourcing_shape CHECK (
    (sourcing_type = 'OWN_PRODUCTION'    AND apiary_id IS NOT NULL AND supplier_id IS NULL)
 OR (sourcing_type = 'SELECTED_SUPPLIER' AND supplier_id IS NOT NULL)
  );

-- money is never negative where it cannot be
ALTER TABLE order_line   ADD CHECK (quantity > 0 AND unit_price_minor >= 0 AND line_total_minor >= 0);
ALTER TABLE "order"      ADD CHECK (grand_total_minor >= 0 AND refunded_total_minor <= grand_total_minor);

-- one active reservation row per (variant, checkout session)
CREATE UNIQUE INDEX reservation_active_unique
  ON stock_reservation (variant_id, checkout_session_id)
  WHERE status = 'ACTIVE';

-- coupon codes are unique case-insensitively
CREATE UNIQUE INDEX coupon_code_ci ON coupon (lower(code));
```

**Immutability triggers** — a `BEFORE UPDATE` trigger on `"order"` and
`order_line` rejects changes to financial and snapshot columns. `order.status`,
`payment_status`, `fulfilment_status`, and `refunded_total_minor` remain mutable;
everything descriptive and monetary does not.

**Append-only triggers** — `stock_ledger_entry`, `audit_log`, and
`order_status_history` reject `UPDATE` and `DELETE` entirely.

---

## 5. Indexing

Indexes are chosen from the actual query list, not from field names that "look
searchable".

### Catalog

```sql
product (status, published_at DESC)                       -- listings
product (primary_category_id, status)
product_translation (locale, slug)              UNIQUE    -- PDP lookup, the hottest read
product_translation USING gin (name gin_trgm_ops)         -- fuzzy search
product_variant (product_id, position)
product_variant (sku)                           UNIQUE
product_category (category_id, product_id)                -- listing join
```

### Inventory

```sql
inventory_item (variant_id, stock_location_id)  UNIQUE
stock_reservation (expires_at) WHERE status = 'ACTIVE'    -- partial: sweeper reads only these
stock_reservation (checkout_session_id)
stock_ledger_entry (variant_id, created_at DESC)          -- history view
stock_ledger_entry (ref_type, ref_id)                     -- trace a movement to its cause
```

### Orders and payments

```sql
"order" (number)                                UNIQUE
"order" (user_id, placed_at DESC)                         -- customer order history
"order" (status, placed_at DESC)                          -- admin queues
"order" (payment_status) WHERE payment_status = 'UNPAID'  -- partial: chase list stays tiny
order_line (order_id)
payment (order_id, status)
payment (status, created_at) WHERE status IN ('CREATED','PENDING')  -- reconciliation sweep
provider_event (provider, event_id)             UNIQUE    -- webhook replay protection
```

### Identity and platform

```sql
"user" (email)                                  UNIQUE    -- citext
session (user_id, expires_at)
session (token_hash)                            UNIQUE
audit_log (subject_type, subject_id, created_at DESC)
outbox_event (published_at, occurred_at) WHERE published_at IS NULL  -- dispatcher
idempotency_key (key, scope)                    UNIQUE
```

**Rules**

- Every foreign key gets an index; Postgres does not create one for you, and the
  missing index shows up as a lock storm on delete.
- Partial indexes for "small hot subset of a big table" — pending payments,
  active reservations, unpublished outbox rows. They stay small and stay in cache.
- Composite index column order follows equality-first, then range, then sort.
- `stock_ledger_entry` is append-heavy: it gets two indexes, not six.
- No index is added without a query that needs it. `pg_stat_user_indexes` is
  reviewed quarterly and unused indexes are dropped.
- Every list endpoint is `EXPLAIN (ANALYZE, BUFFERS)`-checked against seeded
  production-scale data before it ships.

---

## 6. Search

Phase 10 ships Postgres-native search; no external engine at launch.

- Per-locale `tsvector` generated column with the right dictionary
  (`simple` + `unaccent` for Persian, `english` for English), GIN-indexed.
- `pg_trgm` for typo tolerance and short prefixes.
- Ranking combines text rank, publication recency, and an editorial `sort_weight`.
- `SearchIndex` is a port. If Postgres stops being enough, an adapter for a
  dedicated engine is added behind the same interface, with no domain change.

Persian text is normalized before indexing and querying: Arabic Yeh/Kaf mapped to
Persian, ZWNJ handled consistently, diacritics stripped, and digits folded. The
same normalizer runs on write and on read, in `packages/core`, so the two can
never disagree.

---

## 7. Migrations

**Tool:** Prisma Migrate. Migrations are tracked in git under
`packages/db/prisma/migrations/` and are explicitly **not** gitignored.

**Rules**

- One logical change per migration, with a descriptive name.
- Applied migrations are immutable. Never edit, never delete, never re-order.
- Migrations run as a **pre-deploy job**, never on application boot — concurrent
  boots must not race to migrate.
- Every migration is reviewed for lock behaviour before merge.
- Destructive statements (`DROP COLUMN`, `DROP TABLE`, type narrowing) require an
  explicit approval note in the PR and may only appear in a contract migration.

**Expand → migrate → contract**, so rolling deploys never break:

```
Release N     add nullable column / new table / new index CONCURRENTLY
              deploy code that writes both old and new, reads old
Release N+1   backfill in batches (worker job, throttled, resumable)
              deploy code that reads new
Release N+2   drop the old column
```

**Lock-safety checklist**

- `CREATE INDEX CONCURRENTLY` on any table with meaningful volume (and therefore
  outside a transaction — Prisma migrations for these are hand-written).
- Add columns as nullable, or with a constant default (Postgres 11+ makes that
  cheap); never with a volatile default on a large table.
- Add constraints as `NOT VALID`, then `VALIDATE CONSTRAINT` separately.
- Rename via add → dual-write → backfill → drop, never `ALTER … RENAME` on a live
  hot table.
- Set `lock_timeout` and `statement_timeout` for migration sessions so a blocked
  migration fails fast instead of queueing every request behind it.

---

## 8. Transactions and concurrency

- Default isolation is `READ COMMITTED`.
- Money- and stock-critical paths use explicit row locks
  (`SELECT … FOR UPDATE`) rather than a higher isolation level, so behaviour is
  predictable and retries are unnecessary.
- **Lock ordering is global and fixed**: inventory rows are always locked in
  ascending `variant_id` order. This makes deadlock between two concurrent
  checkouts structurally impossible.
- Transactions are short. No HTTP calls, no queue publishes to external systems,
  no file I/O inside a transaction — the outbox exists precisely so that side
  effects happen after commit.
- `statement_timeout` is set per connection role: short for the API, generous for
  the worker and for reporting.
- Optimistic locking (`version` column) on `inventory_item` for the non-locking
  read-modify-write paths in admin tooling.

**Connection pooling** — PgBouncer in transaction mode in production, with
Prisma configured accordingly (no prepared-statement reliance). Pool sizes are
budgeted so that `api_replicas × pool + worker_replicas × pool` stays under
`max_connections` with headroom for migrations and operators.

---

## 9. Data lifecycle and retention

| Data | Retention | Notes |
|---|---|---|
| Orders, order lines, payments | Indefinite | Financial and legal record |
| Stock ledger | Indefinite | Audit trail; partitioned by year if it grows |
| Audit log | 24 months hot, then archived to object storage | Append-only |
| Sessions | Deleted 30 days after expiry | |
| Abandoned carts | 90 days | |
| Expired reservations | 30 days, then purged | |
| Idempotency keys | 24 hours in Redis, 30 days in Postgres | |
| Provider webhook payloads | 90 days, redacted at rest | Debugging window |
| Outbox events | 30 days after publication | |
| Notification deliveries | 12 months | Recipient stored as a hash plus a masked display value |

**Personal data.** On an erasure request, the customer record is anonymized —
name, email, phone, and addresses replaced with tombstones — while orders and
their snapshots remain, because they are a financial record. Order snapshots keep
the address needed for legal retention; everything else is scrubbed. The
procedure is a documented, tested, admin-triggered job, not an ad-hoc SQL script.

---

## 10. Backup and recovery

**Targets:** RPO ≤ 15 minutes, RTO ≤ 2 hours.

| Layer | Mechanism | Frequency | Retention |
|---|---|---|---|
| Continuous | WAL archiving to object storage (PITR) | streaming | 14 days |
| Full logical | `pg_dump -Fc` to object storage, encrypted | nightly | 30 daily, 12 weekly, 12 monthly |
| Pre-migration | Snapshot before every production migration | per deploy | 7 days |
| Object storage | Bucket versioning + lifecycle rules | continuous | 90 days for deleted versions |
| Redis | AOF `everysec` for BullMQ durability | continuous | Cache data is rebuildable and not backed up |

**Rules**

- Backups are encrypted at rest and in transit; keys live in the secret manager.
- Backups are written to a **different account/region** than the primary database
  so a single compromised credential cannot delete both.
- Dumps are never written into the repository — `.gitignore` blocks `*.sql`,
  `*.dump`, `backups/`, and friends. Verified in the Phase 1 gitignore run.
- **A backup that has not been restored is not a backup.** A monthly automated
  drill restores the latest dump into a throwaway environment, runs migrations,
  runs a smoke test, and records the measured RTO in the runbook. A failed drill
  is a P1.
- Restore procedures — full restore, PITR to a timestamp, single-table recovery —
  are written in `infra/runbooks/` with copy-pasteable commands.

---

## 11. Seeding and test data

- `packages/db/seed/` provides a deterministic development seed: locales,
  currencies, roles and permissions, stock locations, shipping zones, tax rules, a
  small realistic catalog with `fa` and `en` translations, one own-production and
  one selected-supplier batch, and a staff user whose credentials come from env.
- Seeds are idempotent — safe to run repeatedly.
- Seed copy respects every content rule: no lab data, no moisture, no health
  claims, no supplier names in customer-facing fields.
- **Seeds never run against production.** The seed script refuses to start unless
  `NODE_ENV !== 'production'` and the database URL is not the production host.
- Integration tests get an ephemeral Postgres per run (container), migrated from
  scratch, with per-test transactional rollback for isolation.
- Any production data used for debugging is anonymized first by a documented
  script. Real customer data never lands on a developer machine.

---

## 12. Monitoring

Watched continuously: connection-pool saturation, slow queries via
`pg_stat_statements` (p95 and p99 per statement), index bloat and unused indexes,
table bloat and autovacuum lag, replication lag, transaction age (wraparound
risk), lock waits and deadlock count, WAL generation rate, and backup job success.

Alerts fire on: replication lag > 30 s, pool saturation > 85 % for 5 minutes, any
deadlock, a query exceeding `statement_timeout` in the API role, autovacuum
falling behind on a hot table, a failed backup, or a failed restore drill.
