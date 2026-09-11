import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, readFile, readdir } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const root = process.cwd();

const required = [
  'apps/web/src/app/[locale]/(storefront)/page.tsx',
  'apps/web/src/app/[locale]/(admin)/admin/layout.tsx',
  'apps/web/src/middleware.ts',
  'apps/web/src/components/hero/hero.tsx',
  'apps/web/src/components/hero/hero-motion-media.tsx',
  'apps/web/src/components/language-switcher/language-switcher.tsx',
  'apps/web/src/lib/api-client/server.ts',
  'apps/web/src/lib/session.ts',
  'apps/web/stylelint.config.mjs',
  'apps/web/e2e/locale-a11y.spec.ts',
  'apps/web/e2e/hero-motion.spec.ts',
  'apps/web/e2e/visual.spec.ts',
  'packages/i18n/src/config.ts',
  'packages/i18n/src/pathnames.ts',
  'packages/i18n/src/messages/en/home.ts',
  'packages/i18n/src/messages/fa/home.ts',
  'packages/ui/src/tokens.css',
  'packages/ui/src/primitives/Button.tsx',
  'docker/web.Dockerfile',
  'docs/web-development.md',
  'scripts/verify-phase9.mjs',
];

const heroFiles = [
  'apps/web/public/media/hero/desktop/honey-poster.webp',
  'apps/web/public/media/hero/desktop/honey-scroll.mp4',
  'apps/web/public/media/hero/desktop/honey-scroll.webm',
  'apps/web/public/media/hero/mobile/honey-poster.webp',
  'apps/web/public/media/hero/mobile/honey-scroll.mp4',
  'apps/web/public/media/hero/mobile/honey-scroll.webm',
  'apps/web/public/media/hero/stills/hero-start.webp',
  'apps/web/public/media/hero/stills/hero-end.webp',
];

const heroHashes = {
  'apps/web/public/media/hero/desktop/honey-poster.webp':
    'd5f060d17bf39be23c66800cc59aff68d6380c3a',
  'apps/web/public/media/hero/desktop/honey-scroll.mp4': 'c1b3a44e2bb0c32c86e9670fa61636ace7197e5d',
  'apps/web/public/media/hero/desktop/honey-scroll.webm':
    'f4cb88484282335b41ff3bc24ca73df6bf38a5b0',
  'apps/web/public/media/hero/mobile/honey-poster.webp': 'eab338f000cd4f37e18bcf9840ce1b42af7ec340',
  'apps/web/public/media/hero/mobile/honey-scroll.mp4': '60bc14fcf31e22367eb75db0220bbb2340f850f3',
  'apps/web/public/media/hero/mobile/honey-scroll.webm': '30fbd08cc1b6d2904d1e728916e437e6a96b344f',
  'apps/web/public/media/hero/stills/hero-start.webp': '1fdcb32ca07a0b5eea0dfb5624af0a98f294e175',
  'apps/web/public/media/hero/stills/hero-end.webp': '053f89d733e85cc934c120c8a23626b679e5da58',
};

async function files(directory) {
  const output = [];
  async function visit(current) {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        return;
      }
      throw error;
    }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.next') {
        continue;
      }
      const path = resolve(current, entry.name);
      if (entry.isDirectory()) await visit(path);
      else output.push(path);
    }
  }
  await visit(resolve(root, directory));
  return output;
}

for (const path of required) {
  await access(resolve(root, path));
}

for (const path of heroFiles) {
  await access(resolve(root, path));
  const { stdout } = await execute('git', ['hash-object', path], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(stdout.trim(), heroHashes[path], `Hero asset changed: ${path}`);
}

const webSources = (await files('apps/web/src'))
  .filter((path) => ['.ts', '.tsx', '.js', '.mjs', '.css'].includes(extname(path)))
  .map((path) => relative(root, path).replaceAll('\\', '/'));

const webSourceText = (
  await Promise.all(webSources.map((path) => readFile(resolve(root, path), 'utf8')))
).join('\n');

assert.match(webSourceText, /shouldEmitHsts|Strict-Transport-Security/u);
assert.match(webSourceText, /protocol === ['"]https:/u);
assert.match(webSourceText, /server-only/u);
assert.match(webSourceText, /preload=["']none["']/u);
assert.match(webSourceText, /prefers-reduced-motion/u);
assert.doesNotMatch(webSourceText, /from\s+['"]@honey\/backend/u);
assert.doesNotMatch(webSourceText, /from\s+['"]@honey\/db/u);
assert.doesNotMatch(webSourceText, /from\s+['"]@prisma\/client/u);
assert.doesNotMatch(webSourceText, /from\s+['"]pg['"]/u);
assert.doesNotMatch(webSourceText, /from\s+['"]redis['"]/u);
assert.doesNotMatch(webSourceText, /from\s+['"]sharp['"]/u);
assert.doesNotMatch(webSourceText, /from\s+['"]@aws-sdk\//u);
assert.doesNotMatch(webSourceText, /apps\/api/u);
assert.doesNotMatch(webSourceText, /localStorage\.setItem\(['"](?:token|session)/iu);
assert.doesNotMatch(webSourceText, /api\/\[\.\.\./u);

const motion = await readFile(
  resolve(root, 'apps/web/src/components/hero/hero-motion-media.tsx'),
  'utf8',
);
assert.match(motion, /'use client'/u);
assert.match(motion, /matchMedia/u);
assert.match(motion, /REDUCED_MOTION_QUERY|prefers-reduced-motion/u);
assert.match(motion, /if\s*\(\s*!allowMotion/u);

const stylelintConfig = await readFile(resolve(root, 'apps/web/stylelint.config.mjs'), 'utf8');
assert.match(stylelintConfig, /declaration-property-value-disallowed-list/u);
assert.match(stylelintConfig, /margin|padding/u);

const cssFiles = [...(await files('apps/web/src')), ...(await files('packages/ui/src'))]
  .filter((path) => extname(path) === '.css')
  .map((path) => relative(root, path).replaceAll('\\', '/'));

const physical =
  /(?:^|[^a-z-])(?:margin|padding|border)-(?:left|right)\s*:|(?:^|[^a-z-])(?:left|right)\s*:|text-align\s*:\s*(?:left|right)|float\s*:\s*(?:left|right)/gim;

for (const path of cssFiles) {
  const css = await readFile(resolve(root, path), 'utf8');
  assert.doesNotMatch(css, physical, `Physical directional CSS in ${path}`);
}

for (const absent of [
  'apps/web/src/app/[locale]/(storefront)/checkout',
  'apps/web/src/app/[locale]/(admin)/admin/page.tsx',
]) {
  await assert.rejects(access(resolve(root, absent)), undefined, `${absent} must not exist`);
}

const { stdout: fonts } = await execute(
  'git',
  ['ls-files', '*.woff', '*.woff2', '*.ttf', '*.otf', '*.eot'],
  { cwd: root, encoding: 'utf8' },
);
assert.equal(fonts.trim(), '', 'No font binaries may be added in Phase 9');

const e2e = (
  await Promise.all(
    ['locale-a11y.spec.ts', 'hero-motion.spec.ts', 'visual.spec.ts'].map((name) =>
      readFile(resolve(root, 'apps/web/e2e', name), 'utf8'),
    ),
  )
).join('\n');
assert.match(e2e, /\/fa/u);
assert.match(e2e, /\/en/u);
assert.match(e2e, /AxeBuilder|@axe-core\/playwright/u);
assert.match(e2e, /reducedMotion:\s*'reduce'/u);
assert.match(e2e, /honey-scroll\.mp4/u);
assert.match(e2e, /honey-scroll\.webm/u);

const ci = await readFile(resolve(root, '.github/workflows/ci.yml'), 'utf8');
for (const gate of [
  'pnpm phase9:verify',
  'pnpm i18n:validate',
  'pnpm stylelint',
  'pnpm test:e2e',
  'pnpm web:docker:build',
  'validate:hardcoded-copy',
  'playwright install',
]) {
  assert.ok(ci.includes(gate), `Phase 9 CI is missing ${gate}`);
}

const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
assert.equal(typeof pkg.scripts['phase9:verify'], 'string');
assert.equal(typeof pkg.scripts['web:docker:build'], 'string');

const webPkg = JSON.parse(await readFile(resolve(root, 'apps/web/package.json'), 'utf8'));
assert.equal(webPkg.dependencies.next, '16.3.0');
assert.ok(!webPkg.dependencies.gsap, 'GSAP must not be added in Phase 9');

const { stdout: trackedEnv } = await execute('git', ['ls-files', '.env'], {
  cwd: root,
  encoding: 'utf8',
});
assert.equal(trackedEnv.trim(), '');

const { stdout: heroStatus } = await execute(
  'git',
  ['status', '--porcelain', '--', 'apps/web/public/media/hero'],
  { cwd: root, encoding: 'utf8' },
);
const { stdout: heroDiff } = await execute(
  'git',
  ['diff', '--stat', 'HEAD', '--', 'apps/web/public/media/hero'],
  { cwd: root, encoding: 'utf8' },
);
assert.equal(heroStatus.trim(), '');
assert.equal(heroDiff.trim(), '');

process.stdout.write('Phase 9 web foundation structural verification passed.\n');
