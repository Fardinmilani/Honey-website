# ADR-0015: Opaque server-side sessions in cookies, not JWTs

**Status:** Accepted · **Date:** 2026-08-04 · **Phase:** 1

## Context

The same authentication mechanism protects a customer's order history and a staff
member's ability to issue refunds and change prices. When a session is
compromised, or a staff member leaves, or a customer clicks "sign out
everywhere", revocation has to be **immediate**. A stateless token is valid until
it expires, no matter what we decide in the meantime.

## Decision

Opaque, high-entropy session identifiers stored server-side, transported in a
cookie.

```
Set-Cookie: __Host-session=<opaque>; HttpOnly; Secure; SameSite=Lax; Path=/
```

- Only the SHA-256 **hash** of the token is stored; a database leak does not
  yield usable sessions.
- The `__Host-` prefix pins the cookie to the exact origin with no `Domain`
  attribute, so no subdomain can set or read it.
- Sliding expiry with an absolute cap. Customers: 30 days. Staff: 8 hours idle,
  12 hours absolute.
- The session id **rotates** on login and on any privilege change, defeating
  session fixation.
- Staff sessions additionally require TOTP two-factor, with step-up
  re-authentication for refunds, price changes, role grants, and data export.
- Cookie-authenticated state-changing requests carry a double-submit CSRF token
  (`__Host-csrf` cookie + `X-CSRF-Token` header, compared in constant time).
- No token is ever placed in `localStorage`, `sessionStorage`, or a URL.

## Consequences

**Positive** — instant revocation, individually or globally; the customer's
active-session list with "sign out everywhere" genuinely works; `httpOnly` means
XSS cannot exfiltrate the session; tokens are small and carry no claims to leak
or to go stale; permission changes take effect on the next request rather than at
the next token refresh.

**Negative / accepted** — a Redis (with Postgres fallback) lookup per
authenticated request, which is ~1 ms and cached; session state must be shared
across replicas, which it already is; cookies require careful CSRF handling,
addressed above; a cross-origin native client would need a different mechanism —
noted, not needed.

## Alternatives considered

| Option | Why not |
|---|---|
| JWT access tokens | Cannot be revoked before expiry. Unacceptable for a session that can authorize a refund |
| JWT + short expiry + refresh rotation | Effectively rebuilds server-side sessions with more moving parts and a worse failure mode |
| JWT in `localStorage` | Directly XSS-exfiltratable. Never |
| Third-party auth SaaS | Vendor dependency and cost for a requirement set we fully control |
| Basic auth for admin | No 2FA, no revocation, no audit trail |
