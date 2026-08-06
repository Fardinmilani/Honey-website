# Identity development

Phase 6 implements identity and authorization in `packages/backend`; `apps/api`
contains only the HTTP mapping. There is no customer or administration UI yet.

## Local setup

Copy `.env.example` to the ignored `.env`, keep the documented development-only
cookie and TOTP-key values, then start PostgreSQL, Redis, and Mailpit:

```sh
pnpm docker:up
pnpm db:migrate
pnpm db:seed
pnpm api:dev
```

Mailpit receives identity verification and password-reset mail at SMTP port
`1025`; inspect messages at `http://127.0.0.1:8025`. The SMTP adapter is narrow
and identity-specific. It is not the later notification subsystem.

The optional seeded owner can authenticate only when
`SEED_STAFF_PASSWORD_HASH` contains an Argon2id hash generated outside the seed.
Plaintext seed passwords are never accepted. Do not reuse the example TOTP key
outside local development.

## Flows

- Registration normalizes the email, preserves the password byte-for-byte,
  screens it through the privacy-preserving breached-password port, hashes it
  with Argon2id, assigns only `CUSTOMER`, and emails a single-use verification
  token. Duplicate registration has the same accepted response.
- Email verification and password reset store only SHA-256 token hashes. New
  requests supersede active tokens; confirmation enforces purpose, expiry, and
  one-time consumption. A successful password reset revokes all sessions.
- Customer login creates a new 256-bit opaque session token. PostgreSQL stores
  only its SHA-256 hash. The raw token appears only in `Set-Cookie`.
- Staff password login creates a short-lived Redis challenge, never a session.
  First use exposes a controlled provisioning URI; a valid RFC 6238 code must
  confirm enrollment. The TOTP secret is stored using AES-256-GCM with a unique
  nonce, and accepted time steps cannot be replayed.
- Redis applies atomic per-IP and per-normalized-identity failure counters with
  bounded exponential lockout. Generic authentication failures do not identify
  the email or password that failed.

## Cookies, expiry, and CSRF

Production requires `__Host-session` with `HttpOnly`, `Secure`, `SameSite=Lax`,
and `Path=/`, with no `Domain`. Local HTTP uses the explicitly configured
`honey_session` exception and must never be copied to production.

Customer sessions have the documented 30-day idle/absolute policy. Staff idle
expiry is 8 hours and the absolute cap is 12 hours. Last-seen writes are
throttled by `SESSION_TOUCH_INTERVAL_SECONDS`. Revocation, password reset,
credential enrollment, and role grants invalidate affected sessions
immediately.

Unsafe requests carrying the session cookie must also provide the CSRF cookie
value in `X-CSRF-Token`. Logout revokes the server-side session before matching
cookies are cleared.

## Authorization and ownership

Every production handler declares exactly one policy: `@Public()` or
`@RequirePermissions(...)`. A global guard denies missing or conflicting
metadata, authenticates cookie sessions, and asks the backend service to test
effective permissions. Startup scans every production controller and refuses to
boot if a handler lacks a policy.

Roles are bundles; checks use permissions. Role assignment requires
`role:grant`, retains the explicit owner restriction, writes an audit event, and
revokes the affected account's sessions. Ownership is checked separately. The
`/v1/me` and session operations can read or revoke only the current account's
resources, returning not found for cross-account session identifiers.

Security audit rows contain action, actor, subject, request ID, trusted client
IP, and explicitly safe metadata only. Database triggers make the rows
append-only. Passwords, hashes, cookies, session values, verification/reset
values, TOTP material, and encryption keys are excluded.

## HTTP routes

| Method | Route | Policy |
|---|---|---|
| `POST` | `/v1/auth/register` | public |
| `POST` | `/v1/auth/login` | public |
| `POST` | `/v1/auth/staff/totp/confirm` | public pre-auth challenge |
| `POST` | `/v1/auth/logout` | authenticated + CSRF |
| `POST` | `/v1/auth/logout-all` | authenticated + CSRF |
| `POST` | `/v1/auth/email-verification/request` | public |
| `POST` | `/v1/auth/email-verification/confirm` | public |
| `POST` | `/v1/auth/password-reset/request` | public, rate limited |
| `POST` | `/v1/auth/password-reset/confirm` | public |
| `GET` | `/v1/me` | authenticated |
| `GET` | `/v1/me/sessions` | authenticated |
| `DELETE` | `/v1/me/sessions/:sessionId` | authenticated + CSRF |

## Tests and troubleshooting

```sh
pnpm --filter @honey/backend test
pnpm --filter @honey/api test
pnpm db:test
pnpm phase6:verify
```

Identity integration tests create and drop a validated disposable PostgreSQL
database, use the local/CI Redis service, and use fake email and
breached-password adapters. Expiry and unit TOTP tests use deterministic clocks;
they do not sleep. The real TOTP integration test generates a code for the
current step and never commits a secret fixture.

- Invalid cookie: clear both local identity cookies and log in again; never
  copy production `__Host-` settings to plain HTTP.
- Expired session: authenticate again. Sliding renewal never crosses the
  absolute cap.
- No Mailpit message: check `pnpm docker:status`, ports `1025`/`8025`, and the
  `IDENTITY_SMTP_*` values.
- Rejected TOTP: synchronize the authenticator clock. Only the configured small
  drift window is accepted, and an already accepted step is intentionally
  rejected.
- Password screening unavailable: the documented policy fails closed with a
  sanitized dependency error; it does not bypass screening.

The Phase 6 migration is forward-only. Never edit the accepted foundation
migration or use `prisma db push`; use `pnpm db:migrate` and the disposable
database suite to prove the complete history.
