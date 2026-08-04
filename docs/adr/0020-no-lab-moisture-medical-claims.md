# ADR-0020: No laboratory, moisture, or medical claims

**Status:** Accepted · **Date:** 2026-08-04 · **Phase:** 1

## Context

Honey marketing is saturated with two patterns: laboratory data (moisture
percentage, HMF, diastase, "lab tested", purity scores) and health claims
(immunity, antibacterial, healing, detox). Both are attractive to copywriters and
both are hazards.

Health claims on food are regulated in essentially every jurisdiction; making
them without authorization invites enforcement action, and search engines apply
additional scrutiny to health content. Laboratory figures create an implicit
promise about every jar that a small-batch producer cannot guarantee across
batches, seasons, and suppliers, and publishing a number invites disputes about
the number. Once such a field exists in the schema, it will be filled in, indexed,
rendered, and put into structured data.

## Decision

These concepts do not exist anywhere in the product, the schema, the API, the
copy, the translations, or the structured data.

**Forbidden**

- Laboratory measurements of any kind: moisture percentage, water content, HMF,
  diastase, sugar profile, purity score
- Laboratory reports, certificates of analysis, test certificates, "lab verified"
  badges
- Medical or therapeutic claims: treating, curing, preventing, or relieving any
  condition; immunity, detox, weight loss, allergy relief, wound healing,
  antibacterial or antimicrobial properties
- Health-benefit comparisons against other foods
- Any schema field, enum value, translation key, filter, badge, or JSON-LD
  property expressing the above under any name

**Permitted — origin, craft, and sensory character**

varietal / floral source · region and altitude · harvest season · apiary ·
harvest batch · colour · aroma · texture · crystallisation behaviour · taste
notes · pairing suggestions · jar size · packaging · storage advice

This is a richer and more genuinely premium vocabulary than a moisture reading,
and it is the language the visual identity is built on.

## Enforcement

Mechanical, not editorial:

- A CI test runs a repo-wide regex —
  `/moisture|water.?content|hmf|diastase|purity|lab.?(test|report|result)|therapeut|medic|cure|treat|antibacterial|immunity|detox/i`
  — over the Prisma schema, API DTOs, the public OpenAPI document, JSON-LD
  builders, and every message catalog. A match fails the build.
- Review moderation guidance in the admin UI instructs staff to reject
  customer reviews containing health claims, since user-generated content on our
  domain still carries regulatory exposure.
- [`AGENTS.md`](../../AGENTS.md) makes this a standing rule for every contributor.

## Consequences

**Positive** — regulatory exposure removed rather than managed; no promise we
cannot keep on every jar; product copy competes on origin and craft, which is
both defensible and on-brand; the CI check means a future contributor, human or
AI, cannot introduce this by copying a competitor's schema.

**Negative / accepted** — competitors will publish moisture figures and lab
certificates, and some buyers actively look for them, so we forgo that
comparison; the regex will occasionally flag an innocent word (`treatment` in an
unrelated context) and needs a reviewed allow-list rather than being switched off.

## Alternatives considered

| Option | Why not |
|---|---|
| Store lab data internally, never display it | The field exists, so eventually something renders it. The only reliable control is absence |
| Allow "traditional use" phrasing | Still a health claim in most regulatory readings, and still a search-quality risk |
| Case-by-case editorial review | Depends on every reviewer knowing the rule forever. A build failure does not |
| Publish certificates as PDFs only | Same promise, same exposure, and harder to audit |
