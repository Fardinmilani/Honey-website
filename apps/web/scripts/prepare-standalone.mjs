import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const webRoot = join(scriptsDir, '..');
const standaloneApp = join(webRoot, '.next', 'standalone', 'apps', 'web');
const staticSrc = join(webRoot, '.next', 'static');
const publicSrc = join(webRoot, 'public');
const staticDest = join(standaloneApp, '.next', 'static');
const publicDest = join(standaloneApp, 'public');
const serverPath = join(standaloneApp, 'server.js');

if (!existsSync(serverPath)) {
  console.error(`Standalone server missing at ${serverPath}. Run next build first.`);
  process.exit(1);
}

mkdirSync(dirname(staticDest), { recursive: true });
cpSync(staticSrc, staticDest, { recursive: true });
cpSync(publicSrc, publicDest, { recursive: true });
console.log('prepare-standalone: copied static + public into standalone output');
