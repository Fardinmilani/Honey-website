# ADR-0043: Dedicated permission for internal order notes

**Status:** Accepted by the human on 2026-10-10
**Date:** 2026-10-10
**Phase:** 17

## Context

The security model permits SUPPORT to read orders/customers and add notes, while
the existing seed grants only read permissions. Reusing `order:write` would also
permit shipment operations. The human explicitly selected a narrow `order:note`
permission when asked to resolve this discrepancy.

## Decision

Internal note creation requires a STAFF principal with `order:note`. OWNER,
ADMIN, ORDER_MANAGER, and SUPPORT receive this grant. SUPPORT receives no
shipment, cancellation, refund, price, or inventory write permission.

A forward migration installs the permission and grants on existing databases,
and revokes affected live staff sessions so a privilege change requires a new
TOTP login. Fresh seeds preserve all existing grant IDs and use separate stable
IDs for the new grants. Notes remain bounded plain text, internal, and audited.

## Consequences

Support can perform the documented task without broader write capability.
Existing staff in affected roles must sign in again after the migration.
Authorization checks use the permission code, never a role-name comparison.

## Alternatives considered

| Option | Why rejected |
|---|---|
| Grant `order:write` to SUPPORT | Also authorizes shipment operations |
| Keep SUPPORT read-only | Does not satisfy the accepted security-model policy |
