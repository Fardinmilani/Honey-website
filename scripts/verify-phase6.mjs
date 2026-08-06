import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, readFile, readdir } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const root = process.cwd();
const required = [
  'packages/backend/src/modules/identity/domain/identity.ts',
  'packages/backend/src/modules/identity/domain/ports.ts',
  'packages/backend/src/modules/identity/application/identity.service.ts',
  'packages/backend/src/modules/identity/infrastructure/identity-crypto.ts',
  'packages/backend/src/modules/identity/infrastructure/prisma-identity.repository.ts',
  'packages/backend/src/modules/identity/infrastructure/redis-auth-state.adapter.ts',
  'packages/backend/src/modules/identity/infrastructure/smtp-identity-email.adapter.ts',
  'packages/backend/src/modules/identity/index.ts',
  'apps/api/src/http/auth/authorization.ts',
  'apps/api/src/http/auth/authorization.guard.ts',
  'apps/api/src/http/auth/route-policy-verifier.ts',
  'apps/api/src/modules/identity/identity.controller.ts',
  'packages/backend/test/identity.test.ts',
  'packages/backend/test/identity.integration.test.ts',
  'apps/api/test/identity.test.ts',
  'packages/db/prisma/migrations/20260806120000_identity_authorization/migration.sql',
  'docs/identity-development.md',
];
for (const path of required) await access(resolve(root, path));

async function files(directory) {
  const output = [];
  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      if (['node_modules', 'dist', '.turbo'].includes(entry.name)) continue;
      const path = resolve(current, entry.name);
      if (entry.isDirectory()) await visit(path);
      else output.push(path);
    }
  }
  await visit(resolve(root, directory));
  return output;
}

const apiSource = (await files('apps/api/src')).filter((path) =>
  ['.ts', '.tsx', '.js', '.mjs'].includes(extname(path)),
);
for (const path of apiSource) {
  const source = await readFile(path, 'utf8');
  assert.doesNotMatch(
    source,
    /from\s+['"](?:@honey\/db(?:\/|['"])|@prisma\/|prisma(?:\/|['"])|argon2(?:\/|['"])|otplib(?:\/|['"])|@otplib\/)/u,
    `${relative(root, path)} bypasses the backend identity boundary`,
  );
}

for (const path of await files('packages/backend/src/modules/identity/domain')) {
  const source = await readFile(path, 'utf8');
  assert.doesNotMatch(source, /@nestjs|fastify|@honey\/db|@prisma|prisma|argon2|otplib|redis/u);
}

const manifests = await Promise.all(
  [resolve(root, 'package.json'), ...(await files('apps')), ...(await files('packages'))]
    .filter((path) => path.endsWith('package.json'))
    .filter((path) => !path.includes('node_modules'))
    .map((path) => readFile(path, 'utf8')),
);
const manifestText = manifests.join('\n');
assert.doesNotMatch(
  manifestText,
  /"(?:jsonwebtoken|jose|passport-jwt|next-auth|oauth|openid-client)"\s*:/iu,
);
assert.doesNotMatch(manifestText, /"next"\s*:/u);

const identitySources = await Promise.all(
  [
    ...(await files('packages/backend/src/modules/identity')),
    ...(await files('apps/api/src/modules/identity')),
  ]
    .filter((path) => ['.ts', '.tsx'].includes(extname(path)))
    .map((path) => readFile(path, 'utf8')),
);
assert.doesNotMatch(identitySources.join('\n'), /\b(?:jwt|oauth|openid|phoneOtp|passkey)\b/iu);

const schema = await readFile(resolve(root, 'packages/db/prisma/schema.prisma'), 'utf8');
const sessionModel = /model Session \{([\s\S]*?)\n\s*\}/u.exec(schema)?.[1] ?? '';
const verificationModel = /model VerificationToken \{([\s\S]*?)\n\s*\}/u.exec(schema)?.[1] ?? '';
assert.match(sessionModel, /tokenHash\s+String/u);
assert.doesNotMatch(sessionModel, /\n\s*token\s+String/u);
assert.match(verificationModel, /tokenHash\s+String/u);
assert.doesNotMatch(verificationModel, /\n\s*token\s+String/u);

const seed = await readFile(resolve(root, 'packages/db/seed/data.ts'), 'utf8');
for (const role of [
  'OWNER',
  'ADMIN',
  'ORDER_MANAGER',
  'INVENTORY_MANAGER',
  'CONTENT_EDITOR',
  'SUPPORT',
  'CUSTOMER',
]) {
  assert.match(seed, new RegExp(`code: '${role}'`, 'u'));
}
const forbiddenMarketplaceRole = ['SELL', 'ER'].join('');
assert.equal(seed.includes(`code: '${forbiddenMarketplaceRole}'`), false);

const controller = await readFile(
  resolve(root, 'apps/api/src/modules/identity/identity.controller.ts'),
  'utf8',
);
for (const route of [
  'auth/register',
  'auth/login',
  'auth/staff/totp/confirm',
  'auth/logout',
  'auth/logout-all',
  'auth/email-verification/request',
  'auth/email-verification/confirm',
  'auth/password-reset/request',
  'auth/password-reset/confirm',
  'me',
  'me/sessions',
]) {
  assert.ok(controller.includes(`'${route}'`), `Identity route ${route} is missing.`);
}
assert.match(controller, /@Public\(\)/u);
assert.match(controller, /@RequirePermissions\(/u);

const openapi = JSON.parse(
  await readFile(resolve(root, 'packages/contracts/openapi.json'), 'utf8'),
);
assert.ok(openapi.components?.securitySchemes?.sessionCookie, 'Cookie authentication is missing.');
for (const path of ['/v1/auth/register', '/v1/auth/login', '/v1/me', '/v1/me/sessions']) {
  assert.ok(openapi.paths?.[path], `OpenAPI path ${path} is missing.`);
}
const openapiText = JSON.stringify(openapi);
assert.doesNotMatch(
  openapiText,
  /sessionToken|tokenHash|passwordHash|secretHash|totpSecret|encryptedSecret|encryptionKey/iu,
);

const environment = await readFile(resolve(root, '.env.example'), 'utf8');
for (const key of [
  'SESSION_COOKIE_NAME',
  'PASSWORD_ARGON2_MEMORY_KIB',
  'TOTP_ENCRYPTION_KEY_BASE64',
  'AUTH_LOCKOUT_MAX_FAILURES',
  'IDENTITY_SMTP_HOST',
]) {
  assert.ok(environment.includes(`${key}=`), `.env.example is missing ${key}.`);
}
assert.match(environment, /development-only|generate|placeholder/iu);

const initialMigrationPath = resolve(
  root,
  'packages/db/prisma/migrations/20260805231327_initial_foundation/migration.sql',
);
await access(initialMigrationPath);
const { stdout: initialMigrationHash } = await execute(
  'git',
  ['hash-object', initialMigrationPath],
  {
    cwd: root,
    encoding: 'utf8',
  },
);
assert.equal(
  initialMigrationHash.trim(),
  'e0b8e84429945e903d11923e96bbf5d25003bd7f',
  'The accepted Phase 4 migration changed.',
);

const rootManifest = await readFile(resolve(root, 'package.json'), 'utf8');
assert.match(rootManifest, /"phase6:verify"/u);
const ci = await readFile(resolve(root, '.github/workflows/ci.yml'), 'utf8');
for (const gate of ['redis:7', 'pnpm phase6:verify', 'pnpm api:docker:build']) {
  assert.ok(ci.includes(gate), `CI is missing ${gate}.`);
}
for (const proof of [
  'rejects a route without authorization metadata at startup',
  'forbidden-api-identity-crypto-import',
  'applies atomic per-key exponential lockout',
]) {
  const testText = [
    await readFile(resolve(root, 'apps/api/test/identity.test.ts'), 'utf8'),
    await readFile(resolve(root, 'tools/boundaries/checker.test.mjs'), 'utf8'),
    await readFile(resolve(root, 'packages/backend/test/identity.integration.test.ts'), 'utf8'),
  ].join('\n');
  assert.ok(testText.includes(proof), `Required Phase 6 proof is missing: ${proof}.`);
}

const { stdout: trackedEnv } = await execute('git', ['ls-files', '.env'], {
  cwd: root,
  encoding: 'utf8',
});
assert.equal(trackedEnv.trim(), '');
const { stdout: heroStatus } = await execute(
  'git',
  ['status', '--porcelain', '--', 'apps/web/public/media/hero'],
  { cwd: root, encoding: 'utf8' },
);
const { stdout: heroDiff } = await execute(
  'git',
  ['diff', '--stat', 'HEAD', '--', 'apps/web/public/media/hero'],
  { cwd: root, encoding: 'utf8' },
);
assert.equal(heroStatus.trim(), '');
assert.equal(heroDiff.trim(), '');

process.stdout.write('Phase 6 identity and authorization structural verification passed.\n');
