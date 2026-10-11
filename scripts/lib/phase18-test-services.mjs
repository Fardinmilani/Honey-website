import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
const execute = promisify(execFile);
export async function createPhase18TestServices() {
  const names = [];
  async function cleanup() {
    for (const name of names)
      if (/^honey-phase18-(redis|mailpit)-[a-f0-9-]{36}$/u.test(name))
        await execute('docker', ['rm', '--force', name], { windowsHide: true, timeout: 30000 });
  }
  try {
    for (const [kind, image, ports] of [
      ['redis', 'redis:7.4.10-alpine3.21', ['127.0.0.1:6387:6379']],
      ['mailpit', 'axllent/mailpit:v1.30.6', ['127.0.0.1:1027:1025', '127.0.0.1:8027:8025']],
    ]) {
      const name = `honey-phase18-${kind}-${randomUUID()}`;
      await execute(
        'docker',
        ['run', '--detach', '--name', name, ...ports.flatMap((port) => ['--publish', port]), image],
        { windowsHide: true, timeout: 120000 },
      );
      names.push(name);
    }
    const deadline = Date.now() + 60000;
    for (;;) {
      try {
        if (
          (
            await globalThis.fetch('http://127.0.0.1:8027/api/v1/messages', {
              signal: globalThis.AbortSignal.timeout(2000),
            })
          ).ok
        )
          break;
      } catch {
        /* Readiness only. */
      }
      if (Date.now() > deadline) throw new Error('Mailpit readiness timed out.');
      await new Promise((r) => setTimeout(r, 1000));
    }
    return {
      env: {
        REDIS_URL: 'redis://127.0.0.1:6387',
        IDENTITY_SMTP_HOST: '127.0.0.1',
        IDENTITY_SMTP_PORT: '1027',
        IDENTITY_SMTP_SECURE: 'false',
        IDENTITY_SMTP_TIMEOUT_MS: '30000',
        IDENTITY_EMAIL_FROM: 'phase18@example.invalid',
      },
      cleanup,
    };
  } catch {
    await cleanup();
    throw new Error('Phase 18 isolated services failed.');
  }
}
