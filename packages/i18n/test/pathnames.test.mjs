import assert from 'node:assert/strict';
import test from 'node:test';
import {
  filesystemPath,
  localizePathname,
  localizedHref,
  parseLocalePath,
  pathnames,
  resolveInternalPathname,
  switchLocalePath,
  toFilesystemLocalePath,
} from '../dist/index.js';

test('pathname map covers catalog and cart routes', () => {
  assert.deepEqual(Object.keys(pathnames).sort(), [
    '/',
    '/cart',
    '/categories',
    '/categories/[slug]',
    '/collections',
    '/collections/[slug]',
    '/products',
    '/products/[slug]',
    '/search',
  ]);
  assert.equal(pathnames['/products'].fa, '/mahsoulat');
  assert.equal(pathnames['/products'].en, '/products');
  assert.equal(pathnames['/categories'].fa, '/dasteha');
  assert.equal(pathnames['/collections'].fa, '/majmooeha');
  assert.equal(pathnames['/search'].fa, '/jostoju');
  assert.equal(pathnames['/cart'].fa, '/sabad-kharid');
});

test('localizedHref fills dynamic slugs', () => {
  assert.equal(localizedHref('/', 'fa'), '/fa');
  assert.equal(localizedHref('/products', 'fa'), '/fa/mahsoulat');
  assert.equal(localizedHref('/products', 'en'), '/en/products');
  assert.equal(localizedHref('/cart', 'fa'), '/fa/sabad-kharid');
  assert.equal(
    localizedHref('/products/[slug]', 'fa', { slug: 'asal-konar' }),
    '/fa/mahsoulat/asal-konar',
  );
  assert.equal(
    localizedHref('/products/[slug]', 'en', { slug: 'sidr-honey' }),
    '/en/products/sidr-honey',
  );
  assert.equal(
    localizedHref('/collections/[slug]', 'fa', { slug: 'kuhestani' }),
    '/fa/majmooeha/kuhestani',
  );
});

test('switchLocalePath remaps localized catalog segments', () => {
  assert.equal(switchLocalePath('/fa/mahsoulat', 'en'), '/en/products');
  assert.equal(switchLocalePath('/en/products', 'fa'), '/fa/mahsoulat');
  assert.equal(
    switchLocalePath('/fa/mahsoulat/asal-konar', 'en', { params: { slug: 'sidr-honey' } }),
    '/en/products/sidr-honey',
  );
  assert.equal(switchLocalePath('/fa/jostoju', 'en'), '/en/search');
});

test('toFilesystemLocalePath rewrites Persian segments to internal paths', () => {
  assert.equal(toFilesystemLocalePath('/fa/mahsoulat'), '/fa/products');
  assert.equal(toFilesystemLocalePath('/fa/mahsoulat/asal-konar'), '/fa/products/asal-konar');
  assert.equal(toFilesystemLocalePath('/en/products/sidr-honey'), '/en/products/sidr-honey');
  assert.equal(toFilesystemLocalePath('/fa/dasteha/asal'), '/fa/categories/asal');
  assert.equal(toFilesystemLocalePath('/fa/jostoju'), '/fa/search');
});

test('filesystemPath uses internal English segments', () => {
  assert.equal(filesystemPath('/products/[slug]', { slug: 'x' }), '/products/x');
  assert.equal(localizePathname('/search', 'fa'), '/jostoju');
});

test('parseLocalePath extracts locale and pathname', () => {
  assert.deepEqual(parseLocalePath('/fa/mahsoulat'), {
    locale: 'fa',
    pathname: '/mahsoulat',
    path: '/fa/mahsoulat',
  });
  assert.equal(parseLocalePath('/').locale, null);
});

test('resolveInternalPathname maps dynamic segments', () => {
  assert.deepEqual(resolveInternalPathname('/mahsoulat/asal-konar', 'fa'), {
    internal: '/products/[slug]',
    params: { slug: 'asal-konar' },
  });
  assert.equal(resolveInternalPathname('/unknown', 'fa'), null);
});
