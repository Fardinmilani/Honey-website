import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const document = await readFile(resolve(directory, '../openapi.json'), 'utf8');
const forbidden = [
  /supplier/iu,
  /landed.?cost/iu,
  /moisture/iu,
  /\blab(?:oratory)?\b/iu,
  /\bhmf\b/iu,
  /diastase/iu,
  /purity/iu,
  /medical/iu,
  /therapeutic/iu,
  /seller.?id/iu,
  /vendor.?id/iu,
  /merchant.?id/iu,
];
const matches = forbidden
  .filter((pattern) => pattern.test(document))
  .map((pattern) => pattern.source);
if (matches.length > 0) {
  process.stderr.write(`Forbidden OpenAPI vocabulary found: ${matches.join(', ')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('OpenAPI forbidden-vocabulary check passed.\n');
}
