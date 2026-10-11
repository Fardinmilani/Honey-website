import { fork, spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const fixture = fork(resolve(root, 'packages/db/test/admin-browser-fixture.ts'), [], {
  cwd: root,
  execArgv: [
    '--import',
    pathToFileURL(resolve(root, 'packages/db/node_modules/tsx/dist/loader.mjs')).href,
  ],
  silent: true,
  windowsHide: true,
});
fixture.stdout?.resume();
fixture.stderr?.resume();
try {
  const ready = await new Promise((accept, reject) => {
    fixture.once('message', accept);
    fixture.once('exit', () => reject(new Error('Fixture failed.')));
    setTimeout(() => reject(new Error('Fixture timeout.')), 150000).unref();
  });
  if (ready === null || typeof ready !== 'object' || typeof ready.databaseUrl !== 'string')
    throw new Error('Database fixture failed.');
  const env = {
    ...process.env,
    DATABASE_URL: ready.databaseUrl,
    DATABASE_MIGRATION_URL: ready.databaseUrl,
    ...(process.argv.includes('--workspace-tests') ? { MEDIA_MINIO_TESTS: 'true' } : {}),
  };
  const commands = process.argv.includes('--workspace-tests')
    ? ['test']
    : process.argv.includes('--phase-verifiers')
      ? Array.from({ length: 15 }, (_, i) => `phase${i + 4}:verify`)
      : ['db:migrate', 'db:migrate:status', 'db:test'];
  for (const command of commands) {
    const child = spawn('pnpm', [command, ...(command === 'test' ? ['--force'] : [])], {
      cwd: root,
      env,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      windowsHide: true,
    });
    const code = await new Promise((accept, reject) => {
      child.once('exit', accept);
      child.once('error', reject);
    });
    if (code !== 0) throw new Error('Disposable database gate failed: ' + command);
  }
} finally {
  if (fixture.connected) fixture.send({ stop: true });
  await new Promise((r) => {
    if (fixture.exitCode !== null) r();
    else fixture.once('exit', r);
  });
}
