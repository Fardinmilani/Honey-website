# ADR-0026: Token CSS and semantic primitive classes for `@honey/ui`

**Status:** Accepted
**Date:** 2026-08-08
**Phase:** 9

## Context

Phase 9 requires `packages/ui` design tokens and primitives built on logical CSS
properties. Earlier docs deferred Tailwind vs CSS Modules. CSS Modules across a
compiled workspace package boundary are fragile for Next.js consumers unless the
app transpiles source modules. Tailwind would pull a utility framework into a
premium, brand-led surface that already needs a small, intentional token set.

## Decision

- `@honey/ui` ships CSS custom properties in `tokens.css` and semantic class
  names (`.ui-*`) in `primitives.css`, re-exported through `styles.css`.
- React primitives apply those class names. Apps import `@honey/ui/styles.css`
  once.
- No Tailwind and no component CSS Modules in this package.
- Logical CSS properties only; physical `left` / `right` / `*-left` / `*-right`
  and `text-align: left|right` are forbidden in package styles.
- Typography uses CSS variables with temporary system stacks; licensed webfonts
  replace stacks by overriding variables only.

## Consequences

### Positive

- One stylesheet import works for storefront and admin.
- Brand tokens stay central and easy to audit for contrast and motion.
- RTL/LTR share one stylesheet via logical properties.
- Font and palette changes do not require React edits.

### Negative / accepted costs

- Class names are global within the imported sheet; the `ui-` prefix is the
  collision boundary.
- Consumers must remember to import the stylesheet; components alone do not
  inject CSS.

## Alternatives considered

- **Tailwind** — rejected for this package; logical utilities help RTL but the
  visual direction is token-led, not utility-first, and the deferred choice is
  resolved against Tailwind here.
- **CSS Modules per primitive** — rejected for cross-package bundler complexity;
  may be revisited inside `apps/web` feature code if needed.
- **Runtime CSS-in-JS** — rejected; adds runtime cost and fights the static token
  file model.
