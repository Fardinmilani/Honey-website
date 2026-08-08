import assert from 'node:assert/strict';
import test from 'node:test';
import {
  listMessageKeys,
  messageContainsHtml,
  messageNamespaces,
  validateMessageCatalogs,
} from '../dist/index.js';

test('English and Persian catalogs have exact key parity', () => {
  const enKeys = listMessageKeys('en').slice().sort();
  const faKeys = listMessageKeys('fa').slice().sort();
  assert.deepEqual(faKeys, enKeys);
  assert.deepEqual(
    [...messageNamespaces],
    ['common', 'navigation', 'home', 'accessibility', 'errors'],
  );
});

test('validateMessageCatalogs passes for shipped catalogs', () => {
  const result = validateMessageCatalogs();
  assert.equal(result.ok, true);
  assert.equal(result.issues.length, 0);
});

test('messageContainsHtml rejects HTML tags', () => {
  assert.equal(messageContainsHtml('Safe text'), false);
  assert.equal(messageContainsHtml('Click <b>here</b>'), true);
  assert.equal(messageContainsHtml('<script>alert(1)</script>'), true);
});

test('validateMessageCatalogs reports HTML and missing keys', () => {
  const catalogs = {
    en: {
      common: {
        brandName: 'Honey',
        skipToContent: 'Skip',
        loading: 'Loading',
        language: 'Language',
      },
      navigation: {
        home: 'Home',
        primaryNavLabel: 'Primary',
        footerNavLabel: 'Footer',
      },
      home: {
        title: 'Honey',
        headline: 'Headline',
        supporting: 'Supporting',
        ctaExplore: 'Explore',
        heroAriaLabel: 'Hero',
      },
      accessibility: {
        languageSwitcher: 'Switcher',
        currentLanguage: 'Current: {language}',
        skipToContent: 'Skip',
      },
      errors: {
        notFound: 'Missing',
        unsupportedLocale: 'Unsupported',
        generic: 'Error',
      },
    },
    fa: {
      common: {
        brandName: 'عسل',
        skipToContent: 'پرش',
        loading: 'بارگذاری',
        language: '<b>زبان</b>',
      },
      navigation: {
        home: 'خانه',
        primaryNavLabel: 'اصلی',
        footerNavLabel: 'پاورقی',
      },
      home: {
        title: 'عسل',
        headline: 'عنوان',
        supporting: 'توضیح',
        ctaExplore: 'کشف',
        heroAriaLabel: 'قهرمان',
      },
      accessibility: {
        languageSwitcher: 'تغییر',
        currentLanguage: 'زبان: {language}',
        skipToContent: 'پرش',
      },
      errors: {
        notFound: 'پیدا نشد',
        unsupportedLocale: 'پشتیبانی نمی‌شود',
        // generic intentionally missing
      },
    },
  };

  const result = validateMessageCatalogs(catalogs);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.code === 'html_in_message'));
  assert.ok(result.issues.some((issue) => issue.code === 'missing_key'));
});
