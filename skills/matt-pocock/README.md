# Matt Pocock's skills, vendored

The engineering skills from [`mattpocock/skills`](https://github.com/mattpocock/skills), kept in
this repo so the setup is reproducible from a clone instead of depending on an unversioned
directory under `$HOME`. Shipped through the root `pi` manifest's `pi.skills`, so
`pi install git:github.com/hs1n/pi-monocoque` brings them back.

**License: MIT, © 2026 Matt Pocock** — see [`LICENSE`](./LICENSE), which travels with these copies
because the licence requires it. Nothing here is this fork's work.

## What is and isn't here

This is a **curated subset**, not upstream's collection. Upstream groups its skills under
`engineering/`, `misc/`, `productivity/`, `in-progress/` and `deprecated/`; these 22 were selected
from across them.

Six of upstream's `engineering/` skills are deliberately **absent**:

| Not vendored | Why |
| --- | --- |
| `code-review`, `implement`, `research` | Each collides by name with a skill under `packages/rpiv-pi/skills/`, where all three are dispatched **by name** from the built-in `/wf` graphs. Any higher-precedence copy shadows rpiv's body while the graph still routes by that name. The **Skill ownership** section of `CONTEXT.md` records why the absence is load-bearing. |
| `implement-spec`, `pr`, `retro` | Not in use here. |

None of the 22 declares a `contract:` block, so they are invisible to rpiv's contract harvesting
(`buildUserSkillContracts`) and cannot perturb contract-driven routing.

## Updating

Vendored from a local `~/.agents/skills` copy that carried **no version marker**, so the upstream
commit it came from is unrecorded. Upstream's `package.json` read `1.3.1` when this was written;
treat this copy as at or before that.

To update: copy from upstream again, re-apply the exclusions above, re-check that no vendored name
collides with `packages/rpiv-pi/skills/`, and record the upstream version here.

## The precedence trap this arrangement accepts

Skill precedence is
`<cwd>/.agents/skills > <cwd>/.pi/skills > ~/.agents/skills > ~/.pi/agent/skills > installed package`.

These copies arrive at the **lowest** rank, as part of the installed package. They are
authoritative only while no higher-ranked copy of the same name exists — so `~/.agents/skills` must
stay empty of these 22 names. Keeping both does not merge them: it silently shadows the repo's
copies, and `/skill:<name>` runs the other one.

## Layout

22 skill directories, each with a `SKILL.md` plus whatever reference files it bundles:

- `*/agents/openai.yaml` — per-skill metadata, which upstream ships on every skill
- reference documents — `codebase-design/DEEPENING.md`, `tdd/tests.md`, `teach/*-FORMAT.md`, …
- `setup-matt-pocock-skills/*.md` — the issue-tracker, domain and triage templates that skill writes
- `diagnosing-bugs/scripts/hitl-loop.template.sh` — a script template, not an executable
