# ADR-0001: pnpm workspace + Turborepo monorepo

**Status:** Accepted · **Date:** 2026-08-04 · **Phase:** 1

## Context

Three deployables (`web`, `api`, `worker`) must share domain types, the API
contract, locale configuration, and design tokens. Keeping them in separate
repositories would mean publishing internal packages and version-skewing the
contract between a frontend and a backend that always deploy together.

## Decision

A single repository, a pnpm workspace, and Turborepo for task orchestration.

- `apps/*` are deployables; `packages/*` are internal libraries consumed by
  source, never published.
- Turborepo defines the `build` / `lint` / `typecheck` / `test` pipeline with
  explicit `dependsOn` and cached inputs/outputs.
- `pnpm-lock.yaml` is committed; `packageManager` pins the exact pnpm version.
- pnpm's non-flat `node_modules` is a feature: a package can only import what it
  actually declares, so phantom dependencies fail immediately.

## Consequences

**Positive** — one atomic commit spans a schema change, an API change, and the
frontend that consumes it; the OpenAPI contract cannot drift between repos;
shared strict TypeScript config; disk-efficient installs; task caching makes CI
fast.

**Negative / accepted** — CI must be scoped with `--filter` or it rebuilds
everything; Turborepo cache configuration is a real thing to maintain and gets
subtly wrong; everyone clones everything; per-app deployment needs Docker build
contexts that understand the workspace.

## Alternatives considered

| Option | Why not |
|---|---|
| Separate repositories | Contract drift between API and web is the exact failure we are designing away |
| npm/yarn workspaces | pnpm is faster, uses far less disk, and its strict linking catches phantom dependencies |
| Nx | More capability than we need; Turborepo's smaller surface is easier to keep correct |
| Single application, no packages | Shared types would be duplicated or imported across app boundaries |
