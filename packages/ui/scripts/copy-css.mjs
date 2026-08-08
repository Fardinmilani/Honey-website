import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src');
const dist = join(root, 'dist');

mkdirSync(dist, { recursive: true });

for (const file of ['tokens.css', 'primitives.css', 'styles.css']) {
  cpSync(join(src, file), join(dist, file));
}
