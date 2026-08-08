# `@honey/ui`

Design tokens and layout/action primitives for the Honey storefront and admin
shell. Phase 9 delivers the foundation only — no product features, no page
compositions, and **no user-facing copy strings**.

## Install / consume

Peer dependencies: `react@19.2.8`, `react-dom@19.2.8`.

In the app root layout (once):

```ts
import '@honey/ui/styles.css';
```

Then import components:

```ts
import { Button, Container, Inline, Link, Stack, VisuallyHidden } from '@honey/ui';
```

`apps/web` sets `transpilePackages` to include `@honey/ui`. This package ships
compiled JS plus CSS under `dist/`.

## Exports

| Export                 | Purpose                                            |
| ---------------------- | -------------------------------------------------- |
| `@honey/ui`            | React primitives + `cx` helper + shared prop types |
| `@honey/ui/styles.css` | Tokens + base document styles + primitive classes  |
| `@honey/ui/tokens.css` | Design tokens only                                 |

### Component API

- `Container` — centered content width (`size`: `sm` \| `md` \| `lg` \| `full`)
- `Stack` — vertical flex (`gap`, `align`)
- `Inline` — horizontal flex (`gap`, `align`, `justify`, `wrap`)
- `Button` — `variant`: `primary` \| `secondary` \| `ghost`; `size`: `sm` \| `md` \| `lg`
- `Link` — text link (`tone`: `default` \| `muted`); pass translated children
- `VisuallyHidden` — accessible name/helper text without visual chrome
- `cx` — class name joiner

Icon-only controls use `Button` (`ghost` + `size`) with an `aria-label` from i18n.
There is no separate `IconButton`.

## Design tokens

Warm specialty-honey palette: ivory ground, amber accents, charcoal ink, muted
gold. Values live as CSS custom properties in `tokens.css`.

| Token                               | Role             |
| ----------------------------------- | ---------------- |
| `--color-bg`                        | Page ivory       |
| `--color-surface`                   | Raised surface   |
| `--color-ink` / `--color-ink-muted` | Text             |
| `--color-amber` / `--color-gold`    | Accent           |
| `--color-border`                    | Hairline borders |
| `--color-focus`                     | Focus ring       |

Motion durations (`--duration-fast`, `--duration-normal`) collapse to `0ms`
under `prefers-reduced-motion: reduce`.

## Font policy

Stacks are **system fallbacks only** for now (no font binaries, no Google Fonts).
Persian stack is documented as temporary until licensed webfonts land.

| Variable                         | Temporary value                            |
| -------------------------------- | ------------------------------------------ |
| `--font-persian`                 | Tahoma, Segoe UI, system-ui, sans-serif    |
| `--font-latin-display`           | Iowan Old Style / Palatino / Georgia serif |
| `--font-latin-body`              | system-ui body stack                       |
| `--font-body` / `--font-display` | Active faces (apps override these)         |

**Font replacement is a CSS-variable-only change.** Components never hard-code
font families. Licensed faces later override `--font-body` and `--font-display`
(and optionally the source stacks) without touching React code.

## CSS strategy

- Design tokens: CSS custom properties
- Primitives: semantic class names (`.ui-button`, `.ui-stack`, …) in
  `primitives.css` — not CSS Modules — so one global import works across the
  monorepo package boundary
- **Logical properties only** (`margin-inline`, `padding-inline`, `inset-inline`,
  `text-align: start` / `end`, …)
- No Tailwind, Material, Ant, or Chakra
- Focus rings use `--color-focus`; clickable controls use `cursor: pointer`

## Copy policy

This package contains **no English or Persian sentences**. Labels, button text,
and link text arrive as `children` or `aria-*` props from `packages/i18n` /
`apps/web`.

## Scripts

```bash
pnpm --filter @honey/ui build
pnpm --filter @honey/ui typecheck
pnpm --filter @honey/ui lint
pnpm --filter @honey/ui test
```
