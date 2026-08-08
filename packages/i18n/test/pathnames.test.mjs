import assert from 'node:assert/strict';
import test from 'node:test';
import {
  localizePathname,
  localizedHref,
  parseLocalePath,
  pathnames,
  resolveInternalPathname,
  switchLocalePath,
} from '../dist/index.js';

test('Phase 9 pathname map only includes home', () => {
  assert.deepEqual(Object.keys(pathnames), ['/']);
  assert.equal(pathnames['/'].fa, '/');
  assert.equal(pathnames['/'].en, '/');
});

test('localizePathname and localizedHref for home', () => {
  assert.equal(localizePathname('/', 'fa'), '/');
  assert.equal(localizePathname('/', 'en'), '/');
  assert.equal(localizedHref('/', 'fa'), '/fa');
  assert.equal(localizedHref('/', 'en'), '/en');
});

test('switchLocalePath maps fa↔en for home', () => {
  assert.equal(switchLocalePath('/fa', 'en'), '/en');
  assert.equal(switchLocalePath('/en', 'fa'), '/fa');
  assert.equal(switchLocalePath('/fa/', 'en'), '/en');
  assert.equal(switchLocalePath('/en?x=1', 'fa'), '/fa');
});

test('parseLocalePath extracts locale and pathname', () => {
  assert.deepEqual(parseLocalePath('/fa'), {
    locale: 'fa',
    pathname: '/',
    path: '/fa',
  });
  assert.deepEqual(parseLocalePath('/en'), {
    locale: 'en',
    pathname: '/',
    path: '/en',
  });
  assert.equal(parseLocalePath('/').locale, null);
});

test('resolveInternalPathname maps home segments', () => {
  assert.equal(resolveInternalPathname('/', 'fa'), '/');
  assert.equal(resolveInternalPathname('/', 'en'), '/');
  assert.equal(resolveInternalPathname('/unknown', 'fa'), null);
});
