# Honey Website

Bilingual Persian/English commerce platform for one luxury honey brand. The
repository is a strict pnpm/Turborepo monorepo and is being delivered one
numbered phase at a time.

## Current state

Phase 2 establishes tooling and workspace boundaries only. There is no Next.js,
NestJS, Prisma, BullMQ, Docker, API, UI, or business implementation yet. The
existing Hero media under `apps/web/public/media/hero/` is protected and must
remain byte-identical.

## Requirements

- Node.js `22.17.0` (LTS)
- pnpm `11.20.0`, activated through Corepack

## Bootstrap

Windows PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-phase2.ps1
```

Linux/macOS:

```sh
sh ./scripts/bootstrap-phase2.sh
```

The bootstrap installs the pinned toolchain dependencies, generates
`pnpm-lock.yaml`, repeats the install with `--frozen-lockfile`, and runs every
Phase 2 quality gate. Commit the generated lockfile with the other Phase 2
files.

## Commands

| Command              | Purpose                                               |
| -------------------- | ----------------------------------------------------- |
| `pnpm build`         | Build every workspace package through Turborepo       |
| `pnpm lint`          | Run ESLint in strict, zero-warning mode               |
| `pnpm boundaries`    | Enforce the documented dependency graph and cycle ban |
| `pnpm typecheck`     | Type-check every workspace package without emitting   |
| `pnpm test`          | Run boundary tests and package test tasks             |
| `pnpm format`        | Format supported files with Prettier                  |
| `pnpm format:check`  | Verify formatting without writing                     |
| `pnpm clean`         | Remove generated build and Turborepo output           |
| `pnpm phase2:verify` | Assert that later-phase frameworks/files are absent   |

## Workspace

```text
apps/
  web/       future Next.js composition root
  api/       future HTTP composition root
  worker/    future BullMQ composition root
packages/
  backend/   future shared business logic
  core/      framework-free primitives
  db/        future persistence adapter
  contracts/ shared transport contracts
  i18n/      locale configuration and formatting
  ui/        future design-system package
  config-ts/ shared strict TypeScript bases
  config-eslint/ shared ESLint flat configuration
  utils/     dependency-free helpers
```

The allowed dependency direction is enforced twice: by ESLint restrictions and
by the zero-dependency checker in `tools/boundaries/`. See
`docs/module-boundaries.md` and `AGENTS.md` before making changes.
