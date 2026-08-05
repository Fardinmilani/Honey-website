import { spawnSync } from 'node:child_process';
import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';

const confirmationPhrase = 'delete local docker volumes';

console.error('DANGER: this permanently deletes all Honey local Docker volumes.');
console.error('PostgreSQL, Redis, MinIO, and Mailpit local data will be lost.');

if (!stdin.isTTY || !stdout.isTTY) {
  console.error('Reset refused: an interactive terminal is required.');
  process.exitCode = 1;
} else {
  const prompt = createInterface({ input: stdin, output: stdout });
  const answer = await prompt.question(`Type "${confirmationPhrase}" to continue: `);
  prompt.close();

  if (answer.trim() !== confirmationPhrase) {
    console.log('Reset cancelled. No volumes were deleted.');
  } else {
    const result = spawnSync('docker', ['compose', 'down', '--volumes'], {
      stdio: 'inherit',
      windowsHide: true,
    });

    if (result.error) {
      throw result.error;
    }

    process.exitCode = result.status ?? 1;
  }
}
