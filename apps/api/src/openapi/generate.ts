import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createApiApplication } from '../bootstrap/create-application.js';
import { loadApiConfig } from '../config/api-config.js';
import { createOpenApiDocument } from './document.js';

const CONTRACT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../packages/contracts/openapi.json',
);

const generationConfig = loadApiConfig({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://contract:contract@127.0.0.1:5432/contract',
  LOG_LEVEL: 'silent',
});

export async function generateOpenApi(): Promise<string> {
  const app = await createApiApplication({ config: generationConfig });
  try {
    await app.init();
    return await createOpenApiDocument(app);
  } finally {
    await app.close();
  }
}

const generated = await generateOpenApi();
if (process.argv.includes('--check')) {
  const committed = await readFile(CONTRACT_PATH, 'utf8').catch(() => '');
  if (committed !== generated) {
    process.stderr.write('OpenAPI drift detected. Run pnpm api:openapi:generate.\n');
    process.exitCode = 1;
  }
} else {
  await writeFile(CONTRACT_PATH, generated, 'utf8');
}
