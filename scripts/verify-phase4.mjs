import { access, readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const required = [
  'packages/db/prisma.config.ts',
  'packages/db/prisma/schema.prisma',
  'packages/db/seed/index.ts',
  'packages/db/test/run-integration.ts',
  'packages/db/src/client.ts',
  'packages/db/src/transaction.ts',
  'packages/db/src/uuid-v7.ts',
];
for (const path of required) await access(resolve(root, path));

const migrationRoot = resolve(root, 'packages/db/prisma/migrations');
const migrationDirectories = (await readdir(migrationRoot, { withFileTypes: true })).filter(
  (entry) => entry.isDirectory(),
);
if (migrationDirectories.length !== 1) {
  throw new Error(
    `Phase 4 requires exactly one initial migration; found ${migrationDirectories.length}.`,
  );
}
const migrationSql = await readFile(
  resolve(migrationRoot, migrationDirectories[0].name, 'migration.sql'),
  'utf8',
);
for (const requiredSql of [
  'inventory_non_negative',
  'reservation_active_unique',
  'coupon_code_ci_idx',
  'order_record_immutable',
  'order_line_immutable',
  'stock_ledger_entry_append_only',
  'audit_log_append_only',
  'order_status_history_append_only',
  'refund_remaining_cap',
]) {
  if (!migrationSql.includes(requiredSql)) throw new Error(`Migration is missing ${requiredSql}.`);
}

const workflow = await readFile(resolve(root, '.github/workflows/ci.yml'), 'utf8');
if (/Verify Phase 2 scope|phase2:verify/u.test(workflow)) {
  throw new Error('The permanent CI workflow still invokes the historical Phase 2 verifier.');
}
for (const requiredCiText of [
  'pnpm install --frozen-lockfile',
  'pnpm format:check',
  'pnpm lint',
  'pnpm boundaries',
  'pnpm typecheck',
  'pnpm test',
  'pnpm build',
  'postgres:16',
  'pnpm phase4:verify',
]) {
  if (!workflow.includes(requiredCiText)) throw new Error(`CI is missing ${requiredCiText}.`);
}

console.log(
  `Phase 4 structural verification passed with migration ${migrationDirectories[0].name}.`,
);
