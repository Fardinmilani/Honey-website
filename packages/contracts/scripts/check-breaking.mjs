import { execFile } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const directory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(directory, '../../..');
const refIndex = process.argv.indexOf('--base-ref');
const fileIndex = process.argv.indexOf('--base-file');
const baseRef = refIndex >= 0 ? process.argv[refIndex + 1] : undefined;
const baseFile = fileIndex >= 0 ? process.argv[fileIndex + 1] : undefined;

if (baseRef === undefined && baseFile === undefined) {
  process.stdout.write('No pull-request base ref supplied; breaking-change comparison skipped.\n');
} else {
  const base = baseFile ?? `${baseRef}:packages/contracts/openapi.json`;
  if (baseRef !== undefined) {
    const exists = await execute('git', ['cat-file', '-e', base], { cwd: repositoryRoot }).then(
      () => true,
      () => false,
    );
    if (!exists) {
      process.stdout.write('The base branch has no OpenAPI document; comparison skipped.\n');
      process.exit(0);
    }
  }
  const executable = resolve(
    repositoryRoot,
    `packages/contracts/node_modules/.bin/openapi-changes${process.platform === 'win32' ? '.CMD' : ''}`,
  );
  const { stdout } = await execute(
    executable,
    ['report', '--reproducible', '--no-logo', base, 'packages/contracts/openapi.json'],
    {
      cwd: repositoryRoot,
      encoding: 'utf8',
      shell: process.platform === 'win32',
    },
  );
  const report = JSON.parse(stdout);
  function hasBreakingChange(value) {
    if (Array.isArray(value)) return value.some(hasBreakingChange);
    if (value !== null && typeof value === 'object') {
      if (value.breaking === true) return true;
      return Object.values(value).some(hasBreakingChange);
    }
    return false;
  }
  if (hasBreakingChange(report)) {
    process.stderr.write(
      'Breaking OpenAPI changes detected. A new major API version is required.\n',
    );
    process.exitCode = 1;
  } else {
    process.stdout.write('OpenAPI breaking-change check passed.\n');
  }
}
