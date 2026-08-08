import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LOCALE_COOKIE_NAME,
  matchAcceptLanguage,
  negotiateLocale,
  parseAcceptLanguage,
  readLocaleCookieHeader,
} from '../dist/index.js';

test('negotiateLocale prefers NEXT_LOCALE cookie over Accept-Language', () => {
  assert.equal(
    negotiateLocale({
      cookie: 'en',
      acceptLanguage: 'fa-IR,fa;q=0.9',
    }),
    'en',
  );
});

test('negotiateLocale uses Accept-Language when cookie is absent', () => {
  assert.equal(
    negotiateLocale({
      acceptLanguage: 'en-US,en;q=0.8,fa;q=0.1',
    }),
    'en',
  );
  assert.equal(
    negotiateLocale({
      acceptLanguage: 'de-DE,de;q=0.9,fa-IR;q=0.8',
    }),
    'fa',
  );
});

test('negotiateLocale falls back to defaultLocale', () => {
  assert.equal(negotiateLocale({}), 'fa');
  assert.equal(negotiateLocale({ cookie: 'de', acceptLanguage: 'fr' }), 'fa');
});

test('parseAcceptLanguage sorts by quality', () => {
  const prefs = parseAcceptLanguage('fr;q=0.1,en-US;q=0.8,fa;q=0.9');
  assert.equal(prefs[0]?.tag, 'fa');
  assert.equal(prefs[1]?.tag, 'en-US');
  assert.equal(prefs[2]?.tag, 'fr');
});

test('matchAcceptLanguage returns null when nothing matches', () => {
  assert.equal(matchAcceptLanguage('de,fr;q=0.8'), null);
});

test('readLocaleCookieHeader reads NEXT_LOCALE', () => {
  assert.equal(LOCALE_COOKIE_NAME, 'NEXT_LOCALE');
  assert.equal(readLocaleCookieHeader('theme=dark; NEXT_LOCALE=en; other=1'), 'en');
  assert.equal(readLocaleCookieHeader('NEXT_LOCALE=fa-IR'), 'fa');
  assert.equal(readLocaleCookieHeader('session=abc'), null);
});
