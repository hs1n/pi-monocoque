# Domain docs

How the engineering skills consume this repo's domain documentation while exploring.

_Follows the domain-doc convention of [`mattpocock/skills`](https://github.com/mattpocock/skills)
(MIT), restated in this repo's own words._

## Read before exploring

- **`CONTEXT.md`** at the repo root — this is a **single-context** repo, so there is exactly
  one.
- **`docs/adr/`** — read the ADRs that touch the area you are about to work in.

If either is missing, proceed silently. Don't flag the absence and don't propose creating
them up front: `/domain-modeling` (reached through `/grill-with-docs` and
`/improve-codebase-architecture`) creates them lazily, at the point a term or a decision is
actually resolved.

## Layout

Single-context:

```
/
├── CONTEXT.md
├── docs/adr/
└── packages/
```

There is a monorepo signal here — `packages/*`, eleven of them — but no `CONTEXT-MAP.md` and
none is planned. The vocabulary is system-wide rather than per-package: `sibling`,
`pipeline` versus `workflow`, `guidance` versus `details`, `thoughts/` all mean the same thing
inside every package. Per-context files would fragment one glossary into eleven.

## Vocabulary

When your output names a domain concept — an issue title, a refactor proposal, a hypothesis, a
test name — use the term as `CONTEXT.md` defines it, and don't drift to the synonyms its
`_Avoid_` lines rule out.

A concept that isn't in the glossary yet is a signal rather than a gap to paper over: either
you are inventing language this project doesn't use, or there is a real term waiting to be
resolved.

## ADR conflicts

If your output contradicts an existing ADR, surface it explicitly instead of quietly
overriding it.
