# Issue tracker: local markdown

Issues and specs for this repo live as markdown files under `.scratch/`. No CLI, no network,
and no repo setting — which also makes them **committed**: `.scratch/` is deliberately not in
`.gitignore`, so a ticket outlives the session and travels with a clone. That is the opposite
posture from `.rpiv/artifacts/`, which is ignored and local-only; keep the two straight —
pipeline artifacts are scratch, tickets are durable.

_Follows the issue-tracker convention of [`mattpocock/skills`](https://github.com/mattpocock/skills)
(MIT), restated in this repo's own words. The engineering skills read this file to learn where
to publish and how to query, so keep the operation names and the section titles stable — they
are what those skills look up._

## Layout

```
.scratch/<feature-slug>/
├── spec.md                        — the spec, when there is one
├── map.md                         — a wayfinder map, when there is one
└── issues/
    ├── 01-<slug>.md               — one file per ticket, numbered from 01, blockers first
    └── 02-<slug>.md
```

One ticket per file, never a single combined tickets file. A ticket carries these fields with
these literal spellings, in this order:

- `# <NN>: <title>` — the heading. `NN` is the ticket's number, zero-padded to two digits and
  agreeing with the filename's prefix.
- `**What to build:**` — what the ticket makes work, from the user's perspective rather than as
  a layer-by-layer list.
- `**Blocked by:**` — the numbers and titles of the tickets gating this one, or the literal
  string `None (can start immediately)`.
- `**Status:**` — one of the five roles in [`triage-labels.md`](./triage-labels.md). Those five
  describe *triage* state, so none of them means "done"; see [Known gaps](#known-gaps).
- `- [ ]` — an acceptance criterion, one per line, as an unticked task-list item.
- `## Comments` — appended conversation, at the bottom of the file.

## Which document wins

**This file does.** The engineering skills are handed this configuration and treat it as the
description of their tracker; a skill's own embedded template is a default for projects that
have not chosen otherwise. When the two disagree about a spelling, follow this file — and where
a skill's template describes something better, change *this* file to match it. The correction
runs toward whatever writes the files, because a config that misdescribes its writer is a trap.

The spellings above are `to-spec`'s and `to-tickets`' own, and they were derived by running
them and reading the output rather than by reading the skills. The first run emitted two fields
this file had never mentioned and spelled the two it did mention differently.

## Publisher conventions

- A skill told to **publish to the issue tracker** writes a new file under
  `.scratch/<feature-slug>/`, creating the directory when it isn't there yet.
- A skill told to **fetch the relevant ticket** reads the file at the referenced path; the
  caller normally passes the path or the issue number directly.

## Pull requests as a request surface

**No.** Nothing routes external PRs through triage here — and a local tracker has no PR
concept to route anyway. The flag exists on the GitHub and GitLab tracker variants; it has no
meaning in this one.

## Wayfinding operations

`/wayfinder` reads this section. Its **map** is a file; each **ticket** is a child file.

- **Map** — `.scratch/<effort>/map.md`, carrying the destination, the standing notes, the
  decisions so far, and the fog.
- **Child ticket** — `.scratch/<effort>/issues/NN-<slug>.md`, numbered from `01`, with the
  question in the body. `**Type:**` records the kind; `**Status:**` records `claimed` /
  `resolved`.
- **Blocking** — `**Blocked by:**` near the top, in the canonical form above. A ticket is
  unblocked once every file it names is `resolved`.
- **Frontier query** — scan `.scratch/<effort>/issues/` for files that are open, unblocked and
  unclaimed; lowest number wins.
- **Claim** — set `**Status:** claimed` and save before any work begins.
- **Resolve** — append the answer under an `## Answer` heading, set `**Status:** resolved`, then
  append a gist-plus-link pointer to the map's decisions in `map.md`.

## Known gaps

Recorded rather than papered over — each is a place where a reader can be wrong silently.

- **No terminal status.** The five roles are triage state and none of them means "done", so a
  finished ticket has no representation. `wayfinder`'s tickets carry `claimed` / `resolved` for
  exactly this reason, but a plain ticket does not. Closing one is a convention today, not a
  field; a sixth role would be an addition to decide deliberately, not a gap to fill in passing.
- **Readers may expect the other form.** Matt's reader-side descriptions — `triage`'s, and the
  wayfinding section he ships — speak of plain `Status:` and `Blocked by:` lines, while
  `to-tickets` writes them bold. A reader matching the plain form finds nothing in a bold-form
  file, and finding nothing is a legitimate answer, so it will not complain. The bold form is
  canonical here because it is what the writer emits; a reader this repo leans on should be
  **verified against it**, not trusted.
