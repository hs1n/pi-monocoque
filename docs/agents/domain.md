# Domain docs

How the engineering skills consume this repo's domain documentation while exploring.

_Follows the domain-doc convention of [`mattpocock/skills`](https://github.com/mattpocock/skills)
(MIT), restated in this repo's own words._

## What actually reads this

More than the docs-creating flow does. `CONTEXT.md` and `docs/adr/` are read by the ordinary
**exploration** step of several skills, so they are load-bearing well beyond `/domain-modeling`:

- **Read while exploring** — `/diagnosing-bugs` ("read `CONTEXT.md` (if it exists) to get a clear
  mental model of the relevant modules, and check ADRs in the area you're touching"), `/tdd` (so
  "test names and interface vocabulary match the project's domain language"), and
  `/improve-codebase-architecture` ("Read the project's domain glossary (`CONTEXT.md`) and any
  ADRs in the area you're touching first").
- **Use the vocabulary in what they produce** — `/to-spec` (the spec's wording), `/to-tickets`
  (ticket titles and descriptions), `/triage` (the codebase exploration behind a disposition),
  `/wait-what` (the words a re-pitch is written in), and `/codebase-design`'s design-it-twice
  brief, which asks for "both SKILL.md vocabulary and CONTEXT.md vocabulary".
- **Write and update them** — `/grill-with-docs`, which "creates docs (ADR's and glossary) as we
  go"; `/triage`, which updates `CONTEXT.md`/ADRs inline as decisions land; `/improve-codebase-
  architecture`, which offers to record a rejected candidate as an ADR "so future architecture
  reviews don't re-suggest it", but only when the reason is one a future explorer would actually
  need; and `/domain-modeling`, the discipline the others drive.
- **Reference rather than restate them** — `/handoff` asks that a handoff not duplicate "content
  already captured in other artifacts (specs, plans, ADRs, issues, commits, diffs)", pointing at
  them by path instead of copying them in.

`/grill-me` is the stateless sibling of `/grill-with-docs`: it saves nothing locally and builds no
`CONTEXT.md`. That is the distinction to reach for when you are *not* in a directory whose docs you
intend to grow.

## Read before exploring

- **`CONTEXT.md`** at the repo root — a **single-context** repo, so there is exactly one.
- **`docs/adr/`** — read the ADRs that touch the area you are about to work in.

The consumers phrase this as "`CONTEXT.md` **(if it exists)**", and that is the rule: when either
is missing, proceed silently. Don't flag the absence and don't propose creating them up front —
`/domain-modeling` creates them lazily at the point a term or a decision is actually resolved, and
`/grill-with-docs` grows them as an interview proceeds. A repo with no glossary yet is a normal
state, not a defect to report.

## Layout

Single-context:

```
/
├── CONTEXT.md
├── docs/adr/
└── packages/
```

There is a monorepo signal here — `packages/*`, eleven of them — but no `CONTEXT-MAP.md` and none
is planned. The vocabulary is system-wide rather than per-package: `sibling`, `pipeline` versus
`workflow`, `guidance` versus `details`, `thoughts/` all mean the same thing inside every package,
so per-context files would fragment one glossary into eleven. `/wait-what` follows `CONTEXT-MAP.md`
when a repo has more than one context; this one has a single, so there is nothing to follow.

## Vocabulary

When your output names a domain concept — an issue title, a refactor proposal, a hypothesis, a test
name — use the term as `CONTEXT.md` defines it, and don't drift to the synonyms its `_Avoid_` lines
rule out.

A concept that isn't in the glossary yet is a signal rather than a gap to paper over: either you are
inventing language this project doesn't use, or there is a real term waiting to be resolved.

## ADR conflicts

If your output contradicts an existing ADR, surface it explicitly instead of quietly overriding it —
and surface **only the real friction**, not every theoretical tension. That second half is the part
worth stating, and `/improve-codebase-architecture` states it inline: "if a candidate contradicts an
existing ADR, only surface it when the friction is real enough to warrant revisiting the ADR. Mark it
clearly in the card (e.g. a warning callout: _\"contradicts ADR-0007, but worth reopening because…\"_).
Don't list every theoretical refactor an ADR forbids."

The first sentence above is this file's own house rule — the seed template this file was derived from
phrases it the same way, so it is not a quotation from a consumer, and it should not be cited as one.
