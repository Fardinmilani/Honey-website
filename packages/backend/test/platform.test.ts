import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  DependencyUnavailableAppError,
  GracefulResourceRegistry,
  HealthService,
  RequestContextStorage,
} from '../src/index.js';
import { PrismaPlatformAdapter } from '../src/platform/infrastructure/prisma-platform.adapter.js';

describe('platform foundation', () => {
  it('reports ready through a healthy fake database port', async () => {
    const check = vi.fn(async () => undefined);
    const service = new HealthService({ check }, 50);
    await expect(service.readiness()).resolves.toEqual({
      status: 'ready',
      checks: { database: 'ready' },
    });
    expect(check).toHaveBeenCalledOnce();
  });

  it('bounds dependency checks and hides their failure', async () => {
    const service = new HealthService({ check: () => new Promise(() => undefined) }, 5);
    const error = await service.readiness().catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(DependencyUnavailableAppError);
    if (!(error instanceof DependencyUnavailableAppError))
      throw new Error('Expected dependency error.');
    expect(JSON.stringify(error.toPublic())).not.toContain('timed out');
  });

  it('propagates request context without knowing about HTTP', () => {
    const context = new RequestContextStorage();
    expect(context.get()).toBeUndefined();
    expect(context.run({ requestId: 'request-1234' }, () => context.get()?.requestId)).toBe(
      'request-1234',
    );
  });

  it('closes registered resources once', async () => {
    const close = vi.fn(async () => undefined);
    const registry = new GracefulResourceRegistry();
    registry.add({ close });
    await Promise.all([registry.close(), registry.close()]);
    expect(close).toHaveBeenCalledOnce();
  });

  it('contains no process bootstrap or HTTP framework in domain/application layers', async () => {
    const root = resolve(import.meta.dirname, '../src');
    const index = await readFile(resolve(root, 'index.ts'), 'utf8');
    const health = await readFile(resolve(root, 'platform/application/health.service.ts'), 'utf8');
    const domain = await readFile(resolve(root, 'platform/domain/health.ts'), 'utf8');
    expect(`${index}${health}${domain}`).not.toMatch(/NestFactory|fastify|apps\/api/iu);
  });

  it.runIf(process.env['DATABASE_URL'] !== undefined)(
    'runs transactions through the database package seam',
    async () => {
      const databaseUrl = process.env['DATABASE_URL'];
      if (databaseUrl === undefined) throw new Error('DATABASE_URL disappeared during the test.');
      const adapter = new PrismaPlatformAdapter(databaseUrl);
      try {
        await expect(adapter.run(async () => 'transaction-ok')).resolves.toBe('transaction-ok');
      } finally {
        await adapter.close();
      }
    },
  );
});
