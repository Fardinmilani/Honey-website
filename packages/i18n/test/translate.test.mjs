import assert from 'node:assert/strict';
import test from 'node:test';
import { createTranslator, interpolate } from '../dist/index.js';

test('createTranslator resolves dotted keys', () => {
  const tFa = createTranslator('fa');
  const tEn = createTranslator('en');

  assert.equal(tFa.locale, 'fa');
  assert.equal(tEn('home.headline'), 'From the mountains of Azerbaijan');
  assert.equal(tFa('home.headline'), 'از کوه‌های آذربایجان');
  assert.equal(tEn('common.brandName'), 'Honey');
  assert.equal(tFa('navigation.home'), 'خانه');
});

test('createTranslator interpolates placeholders', () => {
  const t = createTranslator('en');
  assert.equal(
    t('accessibility.currentLanguage', { language: 'English' }),
    'Current language: English',
  );
  assert.equal(interpolate('Hello {name}', { name: 'Ava' }), 'Hello Ava');
});

test('createTranslator throws on missing keys outside production', () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  try {
    const t = createTranslator('en');
    assert.throws(() => t(/** @type {any} */ ('home.missingKey')), /Missing translation/);
  } finally {
    if (previous === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previous;
    }
  }
});

test('createTranslator returns safe fallback in production', () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const t = createTranslator('en');
    const value = t(/** @type {any} */ ('home.missingKey'));
    assert.equal(value, 'Something went wrong. Please try again.');
    assert.doesNotMatch(value, /home\.missingKey/);
  } finally {
    if (previous === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previous;
    }
  }
});
