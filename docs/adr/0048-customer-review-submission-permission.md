# ADR 0048 — Explicit customer review submission capability

Status: accepted for Phase 18.

## Context

The existing CUSTOMER bundle contains no staff capabilities. Requiring the
staff `order:read` capability would prevent real customers from submitting
reviews even when their own purchase is eligible.

## Decision

Add `review:submit` only to CUSTOMER through a new forward migration and stable
seed identity. Both eligibility and submission explicitly require this capability
at the API and the application service. They also require a CUSTOMER session.
The Orders/Fulfilment application seams separately verify ownership, payment,
refund state and complete delivery. Staff permissions stay unchanged.

## Consequences

Customer authorization remains explicit without granting staff order access.
The original Phase 18 migration is preserved. Real seed/role and browser tests
exercise the capability rather than relying on synthetic staff permissions.
