import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compareStrings,
  formatDate,
  formatList,
  formatMinorMoney,
  formatNumber,
  formatRelativeTime,
  normalizeDigits,
} from '../dist/index.js';

test('formatNumber uses locale numbering systems', () => {
  const fa = formatNumber('fa', 1234);
  const en = formatNumber('en', 1234);

  assert.match(fa, /[۰-۹]/);
  assert.equal(en.replace(/,/g, ''), '1234');
  assert.doesNotMatch(en, /[۰-۹]/);
});

test('normalizeDigits maps Persian and Arabic-Indic to Latin', () => {
  assert.equal(normalizeDigits('۰۱۲۳۴۵۶۷۸۹'), '0123456789');
  assert.equal(normalizeDigits('٠١٢٣٤٥٦٧٨٩'), '0123456789');
  assert.equal(normalizeDigits('A12۳B'), 'A123B');
});

test('formatMinorMoney preserves large minor-unit amounts exactly', () => {
  const usd = formatMinorMoney('en', {
    amountMinor: '9007199254740993123',
    currency: 'USD',
  });
  assert.match(usd.replace(/[^0-9.]/g, ''), /^90071992547409931\.23$/);

  const irr = formatMinorMoney('fa', { amountMinor: '48500000', currency: 'IRR' });
  assert.equal(normalizeDigits(irr).replace(/[^0-9]/g, ''), '48500000');
});

test('formatDate, relativeTime, list, and collation are locale-aware', () => {
  const instant = new Date('2024-03-20T12:00:00.000Z');
  const faDate = formatDate('fa', instant, { year: 'numeric', month: 'long', day: 'numeric' });
  const enDate = formatDate('en', instant, { year: 'numeric', month: 'long', day: 'numeric' });

  assert.ok(faDate.length > 0);
  assert.ok(enDate.length > 0);
  assert.notEqual(faDate, enDate);

  assert.ok(formatRelativeTime('en', -1, 'day').length > 0);
  assert.ok(formatRelativeTime('fa', -1, 'day').length > 0);

  const enList = formatList('en', ['oak', 'sidr']);
  const faList = formatList('fa', ['بلوط', 'سدر']);
  assert.match(enList, /oak/);
  assert.match(faList, /بلوط/);

  assert.equal(typeof compareStrings('fa', 'آب', 'باد'), 'number');
});
