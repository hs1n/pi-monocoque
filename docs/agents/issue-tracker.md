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

One ticket per file, never a single combined tickets file. Near the top of each ticket:

- a `Status:` line — the triage role, which `docs/agents/triage-labels.md` defines once
  Section B of `/setup-matt-pocock-skills` has run (it has not, here)
- a `Blocked by: NN, NN` line, or `None` when the ticket can start immediately
- a `Type:` line on a wayfinder ticket (`research` / `prototype` / `grilling` / `task`)

Comments and conversation append to the bottom under a `## Comments` heading.

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
  question in the body. `Type:` records the kind; `Status:` records `claimed` / `resolved`.
- **Blocking** — a `Blocked by: NN, NN` line near the top. A ticket is unblocked once every
  file it names is `resolved`.
- **Frontier query** — scan `.scratch/<effort>/issues/` for files that are open, unblocked and
  unclaimed; lowest number wins.
- **Claim** — set `Status: claimed` and save before any work begins.
- **Resolve** — append the answer under an `## Answer` heading, set `Status: resolved`, then
  append a gist-plus-link pointer to the map's decisions in `map.md`.
