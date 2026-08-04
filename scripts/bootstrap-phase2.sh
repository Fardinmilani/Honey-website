#!/usr/bin/env sh
set -eu

export COREPACK_ENABLE_DOWNLOAD_PROMPT=0

expected_node='v22.17.0'
expected_pnpm='11.20.0'

if [ "$(node --version)" != "$expected_node" ]; then
  echo "Node $expected_node is required; found $(node --version)." >&2
  exit 1
fi

if [ "$(corepack pnpm --version)" != "$expected_pnpm" ]; then
  echo "pnpm $expected_pnpm is required; found $(corepack pnpm --version)." >&2
  exit 1
fi

run_pnpm() {
  corepack pnpm "$@"
}

run_pnpm install
run_pnpm install --frozen-lockfile
run_pnpm format:check
run_pnpm lint
run_pnpm boundaries
run_pnpm typecheck
run_pnpm test
run_pnpm build
run_pnpm phase2:verify

echo 'Phase 2 bootstrap and verification completed successfully.'
