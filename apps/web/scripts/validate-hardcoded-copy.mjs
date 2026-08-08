import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const scanRoots = [join(root, 'src', 'components'), join(root, 'src', 'app')];

const STRING_LITERAL = /(?<![\w$])(['"`])((?:\\.|(?!\1).){3,}?)\1/gsu;

/** Persian / Arabic script UI copy. */
const PERSIAN = /[\u0600-\u06FF]/u;
/** Likely English UI sentences (letters + spaces, not identifiers). */
const ENGLISH_SENTENCE =
  /^(?=.*\b(?:the|and|for|with|from|your|our|skip|home|language|honey|discover|mountains)\b)[A-Za-z0-9 ,.'’!?-]{8,}$/iu;

const IGNORE_PATTERNS = [
  /^https?:\/\//u,
  /^\/[a-z0-9/_#.-]+$/iu,
  /^[A-Z0-9_#-]+$/u,
  /^(application|text|image|video|multipart)\//u,
  /^(flex|grid|block|none|auto|inherit|rtl|ltr)$/u,
  /^[.#]?[a-z0-9_-]+$/iu,
  /^aria-/iu,
  /^data-/iu,
  /^ui-/iu,
  /^hero__/u,
  /^site-/u,
  // Translation keys passed to createTranslator / t()
  /^(?:common|navigation|home|accessibility|errors)\.[a-zA-Z0-9.]+$/u,
  /^Honey$/u,
  /^Unsupported locale$/u,
  /^This language path is not available\.$/u,
];

async function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walk(full)));
    } else if (/\.(tsx|jsx)$/u.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function isIgnored(value) {
  return IGNORE_PATTERNS.some((pattern) => pattern.test(value.trim()));
}

const violations = [];

for (const scanRoot of scanRoots) {
  for (const file of await walk(scanRoot)) {
    const source = await readFile(file, 'utf8');
    for (const match of source.matchAll(STRING_LITERAL)) {
      const value = match[2]?.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\n/g, ' ') ?? '';
      if (value.length < 4 || isIgnored(value)) continue;
      if (value.includes('${')) continue;
      if (PERSIAN.test(value) || ENGLISH_SENTENCE.test(value.trim())) {
        violations.push(`${relative(root, file)}: ${JSON.stringify(value)}`);
      }
    }
  }
}

if (violations.length > 0) {
  console.error('Hardcoded UI copy detected (use @honey/i18n catalogs):\n');
  for (const violation of violations) {
    console.error(` - ${violation}`);
  }
  process.exit(1);
}

console.log('validate-hardcoded-copy: ok');
