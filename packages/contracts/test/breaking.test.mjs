import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const packageRoot = resolve(import.meta.dirname, '..');

test('breaking checker accepts an unchanged OpenAPI 3.1 contract', async () => {
  await execute(
    'node',
    ['scripts/check-breaking.mjs', '--base-file', 'packages/contracts/openapi.json'],
    {
      cwd: packageRoot,
    },
  );
});

test('breaking checker rejects removal of an operation', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'honey-breaking-'));
  try {
    const document = JSON.parse(await readFile(resolve(packageRoot, 'openapi.json'), 'utf8'));
    document.paths['/removed-probe'] = {
      get: {
        operationId: 'removedProbe',
        summary: 'Removal probe',
        tags: ['Operations'],
        responses: { 200: { description: 'Probe response.' } },
      },
    };
    const basePath = resolve(directory, 'base.json');
    await writeFile(basePath, JSON.stringify(document), 'utf8');
    await assert.rejects(
      execute('node', ['scripts/check-breaking.mjs', '--base-file', basePath], {
        cwd: packageRoot,
      }),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
