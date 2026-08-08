import assert from 'node:assert/strict';
import test from 'node:test';
import {
  defaultLocale,
  getDirection,
  getLangAttribute,
  isLocale,
  localeConfig,
  locales,
  parseLocale,
} from '../dist/index.js';

test('locales are fa and en with Persian default', () => {
  assert.deepEqual([...locales], ['fa', 'en']);
  assert.equal(defaultLocale, 'fa');
});

test('isLocale accepts only launch locales', () => {
  assert.equal(isLocale('fa'), true);
  assert.equal(isLocale('en'), true);
  assert.equal(isLocale('de'), false);
  assert.equal(isLocale('fa-IR'), false);
  assert.equal(isLocale(null), false);
});

test('parseLocale accepts codes and common BCP 47 forms', () => {
  assert.equal(parseLocale('fa'), 'fa');
  assert.equal(parseLocale('EN'), 'en');
  assert.equal(parseLocale('fa-IR'), 'fa');
  assert.equal(parseLocale('en-US'), 'en');
  assert.equal(parseLocale('de-DE'), null);
  assert.equal(parseLocale(''), null);
});

test('dir and lang come from localeConfig', () => {
  assert.equal(getDirection('fa'), 'rtl');
  assert.equal(getDirection('en'), 'ltr');
  assert.equal(localeConfig.fa.dir, 'rtl');
  assert.equal(localeConfig.en.dir, 'ltr');
  assert.equal(getLangAttribute('fa'), 'fa-IR');
  assert.equal(getLangAttribute('en'), 'en-US');
  assert.equal(localeConfig.fa.fontFamily, 'var(--font-persian)');
  assert.equal(localeConfig.en.fontFamily, 'var(--font-latin)');
});
