import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = process.cwd(),
  execute = promisify(execFile);
const git = async (...args) => (await execute('git', args, { cwd: root })).stdout.trim();
const changed = [
  ...new Set([
    ...(await git('diff', '--name-only', 'HEAD')).split('\n'),
    ...(await git('ls-files', '--others', '--exclude-standard')).split('\n'),
  ]),
]
  .filter(Boolean)
  .filter((p) => !p.startsWith('.phase18-'));
async function files(dir) {
  const output = [];
  for (const e of await readdir(resolve(root, dir), { withFileTypes: true })) {
    const p = dir + '/' + e.name;
    if (e.isDirectory()) output.push(...(await files(p)));
    else output.push(p);
  }
  return output;
}
const client = (await files('apps/web/.next/static')).filter((p) =>
  /\.(?:js|json|css|map)$/u.test(p),
);
const values = new Set();
let env = '';
try {
  env = await readFile(resolve(root, '.env'), 'utf8');
} catch {
  /* CI environment only. */
}
const entries = {
  ...Object.fromEntries(
    env
      .split(/\r?\n/u)
      .filter((line) => /^[A-Z0-9_]+=/u.test(line))
      .map((line) => {
        const i = line.indexOf('=');
        return [line.slice(0, i), line.slice(i + 1).replace(/^['"]|['"]$/gu, '')];
      }),
  ),
  ...process.env,
};
for (const [key, value] of Object.entries(entries))
  if (
    typeof value === 'string' &&
    value.length >= 16 &&
    /(?:SECRET|PASSWORD|TOKEN|ENCRYPTION_KEY(?:_BASE64)?|ACCESS_KEY|MERCHANT_ID)$/u.test(key) &&
    !/^replace-with-|^change-me|placeholder/iu.test(value)
  )
    values.add(value);
const failures = [];
for (const path of [...changed, ...client]) {
  if (!/\.(?:ts|tsx|mjs|js|json|md|yml|sql|prisma|css|map)$/u.test(path)) continue;
  const source = await readFile(resolve(root, path), 'utf8');
  if (
    [...values].some((value) => source.includes(value)) ||
    /[?&]token=[A-Za-z0-9_-]{43}(?:["'\s&]|$)/u.test(source)
  )
    failures.push(path);
}
if (failures.length > 0)
  throw new Error(`Secret/token scan failed in ${failures.length} files; values are redacted.`);
process.stdout.write(
  `Secret/token scan passed: ${changed.length} changed files and ${client.length} built client files; ${values.size} configured non-placeholder secret values checked; no literal raw action tokens or matching secrets.\n`,
);
