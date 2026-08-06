# `@honey/contracts`

Committed, deterministic HTTP contracts for the Honey API. Phase 5 exposes
only `GET /healthz` and `GET /readyz` plus RFC 9457 problem details.

- `openapi.json` is the generated OpenAPI 3.1 source of truth.
- `src/generated/api.ts` is generated from that document; do not edit it.
- `src/problem-details.ts` contains the shared transport type.
- `.spectral.yaml` applies the repository OpenAPI lint policy.

```sh
pnpm api:openapi:generate
pnpm api:openapi:check
pnpm api:openapi:lint
pnpm api:openapi:forbidden
pnpm api:openapi:breaking --base-file path/to/base-openapi.json
```

Generation is local and does not call a deployed API. CI regenerates and checks
drift on every run; pull requests additionally compare the proposed contract
with the base branch. The package contains no persistence models or business
rules.
