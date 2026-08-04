# ADR-0019: Hero media is an immutable, in-repo static asset

**Status:** Accepted · **Date:** 2026-08-04 · **Phase:** 1

## Context

The repository's entire history at the start of this project is one commit
containing eight files:

```
apps/web/public/media/hero/
├── desktop/  honey-poster.webp (79 KB)  honey-scroll.mp4 (3.5 MB)  honey-scroll.webm (3.5 MB)
├── mobile/   honey-poster.webp (93 KB)  honey-scroll.mp4 (3.2 MB)  honey-scroll.webm (2.7 MB)
└── stills/   hero-start.webp (143 KB)   hero-end.webp (196 KB)
```

These are the homepage visual anchor and the source of the brand's visual
identity. They are irreplaceable production inputs — the raw footage is not in
the repository, so a lossy re-encode or an accidental overwrite cannot be undone.
Tooling that "optimizes assets" or `.gitignore` patterns that exclude video files
would both destroy them, quietly.

## Decision

Treat these eight files as **immutable, protected, in-repository static assets**.

- They ship inside the web image, served from `public/` behind the CDN with a
  one-year immutable cache. They are **not** uploaded to object storage and are
  never treated as user-generated media.
- **Forbidden:** deleting, renaming, moving, re-encoding, re-compressing,
  overwriting, regenerating, changing the directory layout, or excluding them
  from version control.
- **Allowed:** reading them, referencing them from code, and adding new sibling
  files when a phase explicitly calls for it.
- The `.gitignore` ignores raw masters (`*.mov`, `*.psd`, `assets/raw/`, …) but
  **not** delivery formats, and a guard block at the end of the file explicitly
  re-includes `apps/web/public/media/**` so no future rule can exclude them.
- [`AGENTS.md`](../../AGENTS.md) requires
  `git diff --stat HEAD -- apps/web/public/media/hero` to be empty before any
  phase touching `apps/web` is reported complete.

**Usage pattern** (Phase 9): the `.webp` poster is preloaded with
`fetchpriority="high"` and is the LCP element; the video is `preload="none"`,
`muted`, `playsinline`, with mobile sources selected by media query; under
`prefers-reduced-motion: reduce` the still is rendered and **no `<video>` element
exists**, so nothing is downloaded.

## Consequences

**Positive** — the brand's anchor asset cannot be lost to a tool, a pattern, or a
well-meaning optimization; serving from `public/` means no runtime storage
dependency for the most important image on the site; the verification step makes
accidental modification a caught error rather than a discovered one.

**Negative / accepted** — roughly 13 MB of binary in git, which is bounded and
never changes, so clone size grows once and stops; updating the hero requires a
deliberate human decision rather than a content edit; the web image is larger
than it would be with CDN-hosted media (a good trade for LCP determinism).

## Alternatives considered

| Option | Why not |
|---|---|
| Move to object storage / CDN upload | Adds a runtime dependency for the LCP asset and removes it from version control, where its protection currently comes from |
| Git LFS | Extra tooling for eight files that will not change; LFS misconfiguration is itself a way to lose them |
| Re-encode to smaller files | Irreversible quality loss with no master to re-derive from. The existing encodes are the deliverable |
| Generate posters at build time | Produces different bytes than the supplied stills; the supplied files are the design intent |
