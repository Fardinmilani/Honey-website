import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src');

const PHYSICAL_PROPERTY =
  /(?:^|[^a-z-])(?:margin|padding|border)-(?:left|right)\s*:|(?:^|[^a-z-])(?:left|right)\s*:|text-align\s*:\s*(?:left|right)\b|float\s*:\s*(?:left|right)\b/gim;

function collectCssFiles(dir) {
  /** @type {string[]} */
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectCssFiles(path));
    } else if (entry.name.endsWith('.css')) {
      files.push(path);
    }
  }
  return files;
}

describe('@honey/ui CSS', () => {
  it('uses logical properties only (no physical left/right)', () => {
    const cssFiles = collectCssFiles(src);
    assert.ok(cssFiles.length >= 3, 'expected tokens, primitives, and styles CSS');

    for (const file of cssFiles) {
      const css = readFileSync(file, 'utf8');
      const matches = css.match(PHYSICAL_PROPERTY);
      assert.equal(
        matches,
        null,
        `${file} contains physical CSS properties: ${matches?.join(', ') ?? ''}`,
      );
    }
  });

  it('defines the required color and font tokens', () => {
    const tokens = readFileSync(join(src, 'tokens.css'), 'utf8');
    for (const name of [
      '--color-bg',
      '--color-surface',
      '--color-ink',
      '--color-ink-muted',
      '--color-amber',
      '--color-gold',
      '--color-border',
      '--color-focus',
      '--font-persian',
      '--font-latin-display',
      '--font-latin-body',
      '--font-body',
      '--font-display',
      '--duration-fast',
      '--duration-normal',
    ]) {
      assert.match(tokens, new RegExp(`${name}\\s*:`));
    }
    assert.match(tokens, /prefers-reduced-motion:\s*reduce/);
  });

  it('ships semantic primitive class names', () => {
    const primitives = readFileSync(join(src, 'primitives.css'), 'utf8');
    for (const name of [
      '.ui-container',
      '.ui-stack',
      '.ui-inline',
      '.ui-button',
      '.ui-button--primary',
      '.ui-button--secondary',
      '.ui-button--ghost',
      '.ui-link',
      '.ui-visually-hidden',
      'cursor: pointer',
      '--color-focus',
    ]) {
      assert.ok(primitives.includes(name), `missing ${name}`);
    }
  });
});
