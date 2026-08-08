import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { cx } from '../dist/cx.js';
import { Button, Container, Inline, Link, Stack, VisuallyHidden } from '../dist/index.js';

describe('@honey/ui exports', () => {
  it('exports primitives and cx', () => {
    assert.equal(typeof Button, 'function');
    assert.equal(typeof Container, 'function');
    assert.equal(typeof Inline, 'function');
    assert.equal(typeof Link, 'function');
    assert.equal(typeof Stack, 'function');
    assert.equal(typeof VisuallyHidden, 'function');
    assert.equal(typeof cx, 'function');
  });

  it('joins class names and drops falsy parts', () => {
    assert.equal(cx('a', false, null, undefined, 'b'), 'a b');
    assert.equal(cx(), '');
  });
});
