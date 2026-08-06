import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createApiApplication } from '../bootstrap/create-application.js';
import type { ApiConfig } from '../config/api-config.js';
import { createOpenApiDocument } from './document.js';

const CONTRACT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../packages/contracts/openapi.json',
);

const generationConfig: ApiConfig = {
  nodeEnv: 'test',
  host: '127.0.0.1',
  port: 4000,
  databaseUrl: 'postgresql://contract:contract@127.0.0.1:5432/contract',
  logLevel: 'silent',
  trustProxy: false,
  allowedOrigins: ['http://localhost:3000'],
  bodyLimitBytes: 1_048_576,
  shutdownGraceMs: 10_000,
  readinessTimeoutMs: 2_000,
  rateLimit: { max: 300, windowMs: 60_000 },
  csrf: { cookieName: 'csrf_token', headerName: 'x-csrf-token', secureCookie: false },
};

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
