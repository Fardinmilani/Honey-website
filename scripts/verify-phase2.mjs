import { access, readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const required = [
  'package.json',
  'pnpm-workspace.yaml',
  'turbo.json',
  '.editorconfig',
  '.gitattributes',
  '.env.example',
  'eslint.config.mjs',
  'packages/config-ts/base.json',
  'packages/config-eslint/index.mjs',
  '.github/workflows/ci.yml',
];

for (const path of required) await access(resolve(root, path));

const forbiddenNames = new Set([
  'Dockerfile',
  'docker-compose.yml',
  'docker-compose.yaml',
  'schema.prisma',
]);
async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = resolve(directory, entry.name);
    if (forbiddenNames.has(entry.name)) throw new Error(`Phase 2 forbidden file found: ${full}`);
    if (entry.isDirectory()) await scan(full);
  }
}
await scan(root);

const rootPackage = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const forbiddenDependencies = [
  'next',
  '@nestjs/core',
  '@nestjs/platform-fastify',
  'prisma',
  '@prisma/client',
  'bullmq',
];
for (const dependency of forbiddenDependencies) {
  if (
    dependency in (rootPackage.dependencies ?? {}) ||
    dependency in (rootPackage.devDependencies ?? {})
  ) {
    throw new Error(`Phase 2 forbidden framework dependency found: ${dependency}`);
  }
}

console.log('Phase 2 structural verification passed.');
