import { fileURLToPath } from 'node:url';

import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { format, resolveConfig } from 'prettier';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, sortValue(entry)]),
    );
  }
  return value;
}

export async function createOpenApiDocument(app: NestFastifyApplication): Promise<string> {
  const configuration = new DocumentBuilder()
    .setTitle('Honey API')
    .setDescription(
      'Honey API contract. Cookie-authenticated unsafe requests require the X-CSRF-Token double-submit header.',
    )
    .setVersion('1.0.0')
    .addTag('Operations', 'Process and dependency health endpoints.')
    .addTag('Identity', 'Registration, authentication, account, and session endpoints.')
    .addTag('Media', 'Staff-only direct uploads, trusted media metadata, and private retrieval.')
    .addCookieAuth(
      '__Host-session',
      {
        type: 'apiKey',
        in: 'cookie',
        description: 'Opaque server-side session. Local HTTP development uses honey_session.',
      },
      'sessionCookie',
    )
    .build();
  const document = SwaggerModule.createDocument(app, configuration);
  document.openapi = '3.1.0';
  const prettierConfig = await resolveConfig(fileURLToPath(import.meta.url));
  return format(JSON.stringify(sortValue(document)), {
    ...prettierConfig,
    parser: 'json',
  });
}
