# `@honey/contracts`

Committed, deterministic HTTP contracts for operational and Phase 6 identity
routes, cookie authentication, safe account/session DTOs, and RFC 9457 problems.

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

The opaque session value is represented only by the cookie security scheme and
never by a response field. Credential records, hashes, and TOTP secrets are not
transport types. Generation is local and does not call a deployed API. CI regenerates and checks
drift on every run; pull requests additionally compare the proposed contract
with the base branch. The package contains no persistence models or business
rules.
