# Matt Pocock's skills, vendored

The engineering skills from [`mattpocock/skills`](https://github.com/mattpocock/skills), kept in
this repo so the setup is reproducible from a clone instead of depending on an unversioned
directory under `$HOME`. Shipped through the root `pi` manifest's `pi.skills`, so
`pi install git:github.com/hs1n/pi-monocoque` brings them back.

**License: MIT, © 2026 Matt Pocock** — see [`LICENSE`](./LICENSE), which travels with these copies
because the licence requires it. Nothing here is this fork's work, with one exception:
`grilling/SKILL.md` carries a fork-added paragraph — see
[Fork-modified: `grilling`](#fork-modified-grilling).

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

## Fork-modified: `grilling`

One file in this set is not verbatim. `grilling/SKILL.md` carries an added paragraph that mirrors
the design tree into Pi's `todo` tool — each decision a task, prerequisites as `blockedBy`, the
frontier as the unblocked pending set. That paragraph is **this fork's** change, not Matt Pocock's,
and it is MIT-covered like the rest. Every other file here is unmodified. `FORK_NOTICE.md` records
the divergence and `PROVENANCE.json` carries the drift marker.

## Provenance

[`PROVENANCE.json`](./PROVENANCE.json) is the machine-derived record: for each of the 22, the
upstream `skillPath` and the installer's `skillFolderHash`. It is generated from the installer lock
rather than written by hand, and those hashes make drift detectable without re-downloading
anything.

The copy came from an installer run on **2026-09-21** that recorded itself in
`~/.agents/.skill-lock.json`. That lock held **25** entries against the 22 on disk — it still listed
`code-review`, `implement` and `research`, which had been deleted from disk precisely because they
collide. Upstream's `package.json` read `1.3.1` when this was written, so this copy predates that;
the upstream commit itself is unrecorded, which is what the folder hashes are there to compensate
for.

## Updating — and the thing that will undo this

To update: copy from upstream again, re-apply the exclusions above, re-check that no vendored name
collides with `packages/rpiv-pi/skills/`, and regenerate `PROVENANCE.json`. Then re-apply the
`grilling/SKILL.md` edit below — a verbatim re-copy drops it silently.

**Do not re-run the installer that put these in `~/.agents/skills`.** It is lock-driven, and its lock
still carries all 25 names, so it will restore `code-review`, `implement` and `research` into a
location that outranks the installed package — silently shadowing three skills the built-in `/wf`
graphs dispatch by name. **That is the exact failure this directory exists to prevent**, and it is
why the absence of those three is load-bearing rather than tidy. If the installer is wanted for
something else, keep its output out of `~/.agents/skills`, or verify afterwards that the three names
are still absent.

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
