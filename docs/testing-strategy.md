# Testing strategy

Architecture and test ownership follow ADR 0017 and AGENTS.md. Domain validation
uses unit tests; state/constraints/concurrency use real disposable PostgreSQL.
Authorization, strict bodies, CSRF, limits and public/private caching are verified
through API injection. Queue delivery uses real Redis and application services.
Local SMTP/Mailpit substitutes only the external transport, not business state.

Run `pnpm lint`, `pnpm stylelint`, `pnpm boundaries`, `pnpm typecheck`, `pnpm test`
and `pnpm build`; preserve all Phase 4–18 verifiers. DB history and seed stability
use `pnpm db:test`. `pnpm api:openapi:generate/check/lint/forbidden/breaking` are
separate contract gates, with breaking comparison against the accepted base.

Phase 17 admin and Phase 18 browser runners create disposable PostgreSQL fixtures.
Phase 18 adds isolated Redis, MinIO, Mailpit and a real worker. No runner repairs
or migrates user development data. Credentials stay in private IPC/environment;
token-flow traces/video/screenshots are off. Browser acceptance includes actual
UI mutation, cache revalidation, FA/EN, keyboard, axe and five viewport widths.
`pnpm test:e2e` runs the full storefront separately; `pnpm phase17:test:e2e` and
`pnpm phase18:test:e2e` run their isolated suites. No required skip counts as passed.

The Phase 18 database verifier can run the full workspace suite with
`node scripts/verify-phase18-database.mjs --workspace-tests`, providing a disposable
DATABASE_URL and enabling MinIO contracts. Report exact observed passed/failed/
skipped counts, migration rejection proofs, transport results and known crash risks
in progress and completion reports. Historical temporal absence/count assertions
may advance for delivered phases; security and validation assertions cannot weaken.
