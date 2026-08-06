import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import openapiTS, { astToString } from 'openapi-typescript';
import { format, resolveConfig } from 'prettier';

const directory = dirname(fileURLToPath(import.meta.url));
const target = resolve(directory, '../src/generated/api.ts');
const ast = await openapiTS(new URL('../openapi.json', import.meta.url));
const prettierConfig = await resolveConfig(target);
const generated = await format(astToString(ast), { ...prettierConfig, parser: 'typescript' });

if (process.argv.includes('--check')) {
  const committed = await readFile(target, 'utf8').catch(() => '');
  if (committed !== generated) {
    process.stderr.write('Generated OpenAPI TypeScript types have drifted.\n');
    process.exitCode = 1;
  }
} else {
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, generated, 'utf8');
}
