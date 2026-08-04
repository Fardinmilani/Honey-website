# Security Model

**Posture:** the server is the only authority. The browser renders; it never
decides. Every protected operation is authorized server-side, on every request,
with no exceptions for "internal" pages.

---

## 1. Trust boundaries

```
┌─ UNTRUSTED ────────────────────────────────────────────────────────┐
│ Browser · mobile clients · scrapers · webhook senders before        │
│ signature verification · any third-party response                   │
└─────────────────────────┬──────────────────────────────────────────┘
                          │  validate · authenticate · authorize
┌─────────────────────────▼──────────────────────────────────────────┐
│ SEMI-TRUSTED: apps/web server runtime                               │
│ Holds the session cookie and an internal service token.             │
│ Renders and proxies. Makes NO authorization decision that matters.  │
└─────────────────────────┬──────────────────────────────────────────┘
                          │  session + permission check on every call
┌─────────────────────────▼──────────────────────────────────────────┐
│ TRUSTED: apps/api                                                   │
│ Sole holder of DB credentials, provider keys, signing secrets.      │
│ Owns every business rule, every money computation, every authz.     │
└─────────────────────────┬──────────────────────────────────────────┘
                          │  private network only
┌─────────────────────────▼──────────────────────────────────────────┐
│ DATA: PostgreSQL · Redis · object storage                           │
│ No public ingress. Reachable only from api and worker.              │
└────────────────────────────────────────────────────────────────────┘
```

Anything crossing a boundary inward is validated at that boundary. "It came from
our own frontend" is not a security property — the frontend runs on the
attacker's machine.

---

## 2. Authentication

### 2.1 Customers

- Email + password. **argon2id** (memory ≥ 64 MiB, time ≥ 3, parallelism 1),
  tuned so verification costs ~250 ms on production hardware.
- Passwords: minimum 10 characters, checked against a breached-password list, no
  composition rules, no maximum below 128, no forced rotation. Length beats
  theatre.
- Email verification required before the first order; phone OTP optional and
  rate-limited.
- Password reset uses a single-use, 30-minute, hashed token. The response is
  identical whether or not the account exists.
- Successful login **rotates the session id** (fixation defence) and invalidates
  all other sessions on password change.

### 2.2 Staff

Same user table, `isStaff = true`, plus:

- **TOTP two-factor is mandatory.** No staff session exists without it.
- Session TTL 8 hours idle / 12 hours absolute, versus 30 days for customers.
- Step-up re-authentication for dangerous operations: refunds, price changes,
  role grants, data export, bulk delete.
- Optional IP allow-list per staff account.
- Every staff action writes an `audit_log` row.

### 2.3 Sessions

Opaque random session identifiers, **not JWTs** ([ADR-0015](adr/0015-session-auth.md)).
The reason is revocation: a stolen JWT is valid until it expires, whereas a
server-side session dies the moment we say so — which matters when the session
can authorize a refund.

```
Set-Cookie: __Host-session=<opaque>; HttpOnly; Secure; SameSite=Lax; Path=/
```

- `__Host-` prefix pins the cookie to the exact origin with no `Domain`.
- Only the SHA-256 **hash** of the token is stored server-side.
- Sliding expiry with an absolute cap; rotation on privilege change.
- The customer's active session list is visible in their account with a
  "sign out everywhere" control that actually works.
- No token is ever placed in `localStorage`, `sessionStorage`, or a URL.

---

## 3. Authorization

### 3.1 Roles

| Role | Scope |
|---|---|
| `OWNER` | Everything, including role management and settings |
| `ADMIN` | Everything except owner-only settings and role grants |
| `ORDER_MANAGER` | Orders, fulfilment, refunds, customer support views |
| `INVENTORY_MANAGER` | Inventory, sourcing, procurement, suppliers |
| `CONTENT_EDITOR` | Catalog content, pages, articles, media, review moderation |
| `SUPPORT` | Read-only orders and customers, add notes, no money operations |
| `CUSTOMER` | Own cart, own orders, own addresses, own profile |

**There is no seller role.** There will never be one — that is a product
invariant, not a configuration.

### 3.2 Permission-based checks

Roles are bundles; **checks test permissions**, so the role set can change without
touching call sites.

```
catalog:read  catalog:write  catalog:publish
inventory:read  inventory:adjust
procurement:read  procurement:write
order:read  order:write  order:refund  order:cancel
customer:read  customer:export
content:read  content:write  content:publish
review:moderate
settings:read  settings:write
role:grant  audit:read
```

Enforcement rules:

- Every endpoint declares its required permission explicitly. A route with no
  declaration **fails closed** — the guard denies by default and a startup check
  refuses to boot if any controller method lacks a declaration.
- Ownership is checked separately from capability: `order:read` lets a customer
  read *their* orders. Staff need an additional `order:read:any`-style scope,
  resolved through the permission set rather than an `if (isAdmin)` scattered in
  handlers.
- Authorization happens in the **application layer**, on the loaded resource —
  not in middleware guessing from a URL, and never in the client.
- Unauthorized access to a resource whose existence is itself sensitive returns
  `404`, not `403`.
- The full role × endpoint matrix is covered by integration tests, including the
  negative cases. A new endpoint without an authorization test fails review.

### 3.3 The web app is not a security boundary

Next.js middleware, route guards, and conditionally rendered admin navigation are
**UX only**. They exist so users do not see broken pages. Every one of those
requests is independently authorized by the API. Hiding a button is not
authorization.

---

## 4. Input validation

- Schema validation at every boundary: HTTP bodies, query, params, headers,
  cookies, environment variables, webhook payloads, queue job data, and
  third-party responses.
- **Unknown properties are rejected**, not stripped. Silent stripping hides both
  client bugs and tampering.
- Bounds on everything: body ≤ 1 MB, page size ≤ 100, arrays capped, strings
  length-capped, integers range-checked, enums closed.
- Output is serialized through explicit DTOs. Entities are never returned
  directly, which is what prevents a new database column from leaking on its
  first day.

### Money and stock tampering

Request schemas contain no `price`, `total`, `discountAmount`, `shippingCost`,
`taxAmount`, `stock`, or `paymentStatus` fields. Sending one produces a `422`
**and** a `security.tampering_attempt` audit event with the principal, request id,
and offending field. Repeated attempts trigger rate-limit escalation.

---

## 5. The OWASP Top 10, concretely

| Risk | Control |
|---|---|
| **A01 Broken access control** | Permission declaration required per endpoint, fail-closed guard, ownership checks on loaded resources, full authz test matrix, `404` for sensitive non-access |
| **A02 Cryptographic failures** | TLS 1.2+ with HSTS preload, argon2id passwords, hashed session and verification tokens, secrets in a manager, encrypted backups, no card data on our infrastructure |
| **A03 Injection** | Prisma parameterization only; `$queryRawUnsafe` is lint-banned; schema validation on all input; React auto-escaping; `dangerouslySetInnerHTML` only on server-sanitized CMS HTML with an allow-list |
| **A04 Insecure design** | Server-authoritative pricing and stock, immutable order snapshots, reservation locks, idempotency, transactional outbox, threat model reviewed per phase |
| **A05 Security misconfiguration** | Env schema validated at boot, no debug in production, generic error bodies, minimal container images, non-root users, security headers enforced by test |
| **A06 Vulnerable components** | Renovate for updates, `pnpm audit` in CI, lockfile committed, SBOM per release, no dependency without a stated need |
| **A07 Identification/authentication failures** | Rate limiting per IP and per identity, exponential lockout, session rotation, mandatory staff 2FA, enumeration-safe responses |
| **A08 Software/data integrity** | Signed webhooks, pinned base images by digest, CI-only deploys, immutable audit log, provenance on release artifacts |
| **A09 Logging/monitoring failures** | Structured logs with correlation ids, security events emitted explicitly, alerting on auth-failure spikes and tampering attempts, immutable audit trail |
| **A10 SSRF** | No user-supplied URL is fetched server-side; outbound egress restricted to an allow-list of provider hosts; image imports go through a validated pipeline |

---

## 6. Browser-facing hardening

**Headers** (set at the edge and asserted by an e2e test, so they cannot silently
disappear):

```
Content-Security-Policy: default-src 'self';
  script-src 'self' 'nonce-<per-request>';
  style-src 'self' 'nonce-<per-request>';
  img-src 'self' data: https://<cdn>;
  media-src 'self' https://<cdn>;
  font-src 'self';
  connect-src 'self' https://<api>;
  frame-ancestors 'none'; base-uri 'none'; object-src 'none';
  form-action 'self' https://<psp-domains>;
  upgrade-insecure-requests
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
```

No `unsafe-inline` and no `unsafe-eval`. Nonces are per-request. `form-action`
lists PSP domains only because redirect-based Iranian gateways require a real
form post.

**CSRF** — cookie-authenticated state-changing requests carry a double-submit
token: a `__Host-csrf` cookie plus a matching `X-CSRF-Token` header, compared in
constant time. `SameSite=Lax` is defence in depth, not the primary control.

**CORS** — the API allows exactly the storefront origins. No wildcard, no
credentialed wildcard, no origin reflection.

**Clickjacking** — `frame-ancestors 'none'`.

---

## 7. Secrets

| Rule | Detail |
|---|---|
| Where they live | Environment variables, sourced from a secret manager in deployed environments; untracked `.env` locally |
| What is tracked | `.env.example` only, with safe placeholders — never a real value |
| What is never a secret's home | Source, tests, fixtures, seeds, docs, commit messages, log lines, error responses, analytics, image layers |
| Client exposure | Only `NEXT_PUBLIC_`-prefixed values reach the browser, and none of them may be secret. A CI check greps the client bundle for known secret patterns |
| Rotation | Quarterly, and immediately on any suspicion. Every secret is rotatable without a code change |
| Detection | Secret scanning in CI; a hit blocks the build |
| Compromise | Treat as compromised, rotate, invalidate sessions, review audit log, document in the incident record |
| Logging | Central redaction serializer removes tokens, passwords, cookies, card fields, and full addresses before anything is written |

---

## 8. Payment security

- **Card data never touches our infrastructure.** Redirect or hosted-field flows
  only; we store provider references and tokens.
- The browser is never believed about payment state. A redirect carrying
  `?status=success` is an untrusted hint that triggers a server-side
  `verifyReturn` against the provider.
- Webhooks are signature-verified against the raw body, timestamp-checked
  (≤ 5 min skew), deduplicated by a unique provider event id, stored raw, and
  processed asynchronously and idempotently.
- The captured amount is compared to `order.grandTotalMinor`. A mismatch does not
  mark the order paid — it raises a reconciliation alert.
- Refunds require `order:refund` plus step-up authentication, are capped at the
  remaining refundable amount by a database constraint, and are always audited.
- A reconciliation job polls provider status for payments stuck in `PENDING`, so
  a lost webhook cannot strand an order or a customer's money.

---

## 9. File uploads

- Admin-only. Uploads go directly to object storage via **short-lived pre-signed
  URLs**; the API never proxies bytes.
- Content type is verified by **magic-number sniffing**, not by the client-sent
  `Content-Type` or the file extension.
- Allow-list: `image/jpeg`, `image/png`, `image/webp`, `image/avif`, `video/mp4`,
  `video/webm`. **SVG is rejected** — it is a script-execution vector.
- Images are re-encoded server-side by the media worker, which strips EXIF
  (including GPS) and produces derivatives.
- Size caps per type; storage keys are server-generated UUID paths, never the
  user's filename.
- Public media is served from a CDN origin with `Content-Disposition` and
  `X-Content-Type-Options: nosniff`; private documents (invoices, exports) are
  served only through short-lived signed URLs.

---

## 10. Privacy and data protection

- Collect the minimum: name, email, phone, shipping address, order history.
- Optional analytics are consent-gated and cookieless by default.
- Emails are stored `citext` and compared case-insensitively; notification
  recipients are stored as a hash plus a masked display value.
- Customer-facing exports of personal data are available through the account.
- Erasure anonymizes the user record — name, email, phone, addresses replaced
  with tombstones — while orders remain as financial records with only the
  legally required address retained. This is a tested job, not ad-hoc SQL.
- Staff access to customer data is audited; bulk export requires `customer:export`
  plus step-up authentication and is alerted on.
- Third-party data processors are documented in the privacy page per locale.

---

## 11. Infrastructure

- Postgres, Redis, and object storage have **no public ingress**; only `api` and
  `worker` can reach them, on a private network.
- Containers run as a non-root user with a read-only root filesystem and no
  capabilities beyond what they need.
- Base images are pinned by digest and rebuilt weekly for patches.
- No secrets in image layers or build args; runtime injection only.
- Least-privilege database roles: the application role cannot `DROP`, and
  migrations run under a separate, temporarily elevated role.
- Backups are encrypted and written to a different account/region so one
  compromised credential cannot destroy both primary and backup.
- Administrative access to infrastructure requires MFA and is logged.

---

## 12. Security events and monitoring

Emitted explicitly, alerted on, and retained:

`auth.login_failed` · `auth.lockout` · `auth.session_revoked` ·
`authz.denied` · `security.tampering_attempt` · `security.csrf_failure` ·
`payment.signature_invalid` · `payment.amount_mismatch` ·
`inventory.oversell_prevented` · `admin.privileged_action` ·
`admin.bulk_export` · `secret.scan_hit`

Alert thresholds: a spike in `auth.login_failed` from one IP or against one
account; any `payment.signature_invalid`; any `payment.amount_mismatch`; any
`inventory.oversell_prevented`; any `secret.scan_hit`; unusual admin activity
outside working hours.

---

## 13. Development-time controls

| Control | Where |
|---|---|
| Secret scanning | Pre-commit hook + CI |
| Dependency audit | CI, blocking on high/critical |
| Static analysis | ESLint security rules, `no-restricted-imports` for raw SQL |
| Authorization tests | Required for every new endpoint |
| Security-header test | Playwright assertion on every response class |
| Forbidden-field scan | OpenAPI document scanned for `supplier`, `landedCost`, `moisture`, `lab`, and related terms |
| Threat-model review | Per phase, recorded in `docs/progress.md` |
| Penetration test | Before launch (Phase 20) and annually |

---

## 14. Incident response

1. **Detect** — alert or report.
2. **Contain** — revoke sessions and credentials, disable the affected path,
   rate-limit or block the source.
3. **Assess** — scope, data involved, timeline, from the audit log and traces.
4. **Eradicate** — fix the cause; never just the symptom.
5. **Recover** — restore from verified backups if needed; verify integrity.
6. **Notify** — affected users and any legally required authority, within the
   applicable window.
7. **Learn** — blameless post-mortem with dated action items in `docs/progress.md`.

Runbooks with concrete commands live in `infra/runbooks/`. Contact and escalation
paths are defined before launch, not during an incident.
