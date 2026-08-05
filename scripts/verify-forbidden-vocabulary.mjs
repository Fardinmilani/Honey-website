import { readFile, readdir } from 'node:fs/promises';
import { extname, resolve } from 'node:path';

const root = process.cwd();
const fragments = [
  'mois' + 'ture',
  'water.?content',
  'h' + 'mf',
  'dias' + 'tase',
  'pur' + 'ity',
  'lab.?(test|report|result)',
  'thera' + 'peut',
  'med' + 'ic',
  'cu' + 're',
  'tre' + 'at',
  'anti' + 'bacterial',
  'immu' + 'nity',
  'de' + 'tox',
];
const forbidden = new RegExp(fragments.join('|'), 'iu');
const schemaIdentifier = /\b[A-Za-z_][A-Za-z0-9_]*\b/gu;
const textExtensions = new Set(['.json', '.prisma', '.ts', '.tsx', '.yaml', '.yml']);
const scanRoots = [
  'packages/db/prisma/schema.prisma',
  'apps/api/src',
  'packages/contracts',
  'packages/i18n/src',
  'apps/web/src/lib/seo',
];

async function collect(path) {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    const nested = await Promise.all(entries.map((entry) => collect(resolve(path, entry.name))));
    return nested.flat();
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error) {
      if (error.code === 'ENOTDIR') return [path];
      if (error.code === 'ENOENT') return [];
    }
    throw error;
  }
}

const files = (await Promise.all(scanRoots.map((path) => collect(resolve(root, path))))).flat();
const violations = [];
for (const file of files) {
  if (!textExtensions.has(extname(file))) continue;
  const source = await readFile(file, 'utf8');
  if (file.endsWith('schema.prisma')) {
    for (const identifier of source.matchAll(schemaIdentifier)) {
      if (forbidden.test(identifier[0]))
        violations.push(`${file}: schema identifier ${identifier[0]}`);
    }
  } else if (forbidden.test(source)) {
    violations.push(file);
  }
}

if (violations.length > 0) {
  throw new Error(`Forbidden vocabulary found:\n${violations.join('\n')}`);
}
console.log(`Forbidden-vocabulary verification passed across ${files.length} scoped files.`);
