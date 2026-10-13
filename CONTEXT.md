# pi-monocoque

A standalone fork of `rpiv-mono` that ships the `@hs1n/rpiv-*` Pi extension family as a Pi
source. Several words below mean something narrower here than they do in Pi itself or in
upstream's docs, so this file is the tie-breaker. Deep detail lives in
`.rpiv/guidance/**` (auto-injected) and `FORK_NOTICE.md` (provenance); this file only
fixes vocabulary.

## Language

### Provenance

**upstream**:
`juicesharp/rpiv-mono`, frozen at v2.13.8 (`2d88b79c`). The `upstream` remote was removed
after the final sync — there is no merge path.
_Avoid_: origin, parent repo, source

**@juicesharp**:
Upstream's npm scope. It identifies upstream's artifacts and is not ours to use.
_Avoid_: the old scope, the original scope

### Packages

**sibling**:
A Pi extension package registered in `extensions/rpiv-core/siblings.ts`. That registry is
the single source of truth: one entry drives `/rpiv-setup`, missing-sibling warnings, and
presence detection.
_Avoid_: plugin, module, addon, dependency

**opt-in sibling**:
A package that rides lockstep and shared CI but is absent from `siblings.ts`, from
`rpiv-pi`'s `peerDependencies`, and from the root `pi` manifest — so neither `/rpiv-setup`
nor a git install reaches it. Installed via `scripts/fork-pi-install.sh --with <name>`.
Today that is `rpiv-btw` alone.
_Avoid_: optional package, disabled plugin

**legacy sibling**:
A superseded package name tracked in `LEGACY_SIBLINGS` and pruned on upgrade.
_Avoid_: deprecated sibling, old name

**host-provided**:
A package Pi ships and aliases to its own copy at load time — `typebox`, the
`@earendil-works/pi-*` trio, and the legacy `@mariozechner/*` spellings. Always
`peerDependencies: "*"`, never `dependencies`: an installed copy puts two live copies of
one module in a single process.
_Avoid_: bundled, vendored, built-in

**lockstep**:
Every `packages/*/package.json` shares one `version`, hand-maintained and enforced by
`sync-versions.js`. Nothing is published, so the version is a marker, not a release.
_Avoid_: semver, independently versioned

### Side calls

**side call**:
A one-off model call an extension makes outside the main transcript — its own prompt, no
tools, nothing written back. `rpiv-advisor` and `rpiv-btw` are the two surfaces that make
one; `rpiv-sidecall` is the shared module that resolves how to make one across host
versions.
_Avoid_: sub-call, secondary request, side conversation (`/btw`'s overlay is its UI, not the call)

### Skill ownership

Two skill sources are installed here — `skills/matt-pocock/` (Matt Pocock's engineering skills,
vendored into this repo and shipped through the root `pi` manifest) and
`packages/rpiv-pi/skills/` — and three names exist in both upstream collections: `research`,
`implement`, `code-review`. **Nothing collides today**, because the vendored set leaves those
three out. That omission is load-bearing, not hygiene, and it is the first thing to re-check when
refreshing the vendored copy.

**research**, **implement**, **code-review**:
**Neither side may be swapped for the other.** User-level skills outrank the installed
package — `<cwd>/.agents/skills > <cwd>/.pi/skills > ~/.agents/skills > ~/.pi/agent/skills >
installed package (this fork)` (`scripts/fork-own-skill.mjs`). The vendored set rides at the
**lowest** rank, as part of the installed package, so it is authoritative only while no copy of
the same name sits higher. Putting `research`, `implement` or `code-review` into `~/.agents/skills`
or a project `.agents/skills` shadows rpiv-pi's body, while the `contract:` the graphs validate
against is harvested by a separate provider that finds nothing to replace it with, matt's skills
declaring none.

All three are dispatched by name from the built-in `/wf` graphs: `implement` is an `acts`
stage in all four (build, vet, polish, ship), `code-review` a gate stage in polish and vet,
`research` build's second stage, dispatched as `/skill:research` (`workflows/build.ts`).
Only the skill-shaped stages carry a contract schema, though — `code-review`'s
`blockers_count`, which `workflows/shared.ts` sources from the skill rather than
redeclaring per workflow, is the one number the graph routes on. `research` is
prompt-dispatched and `implement` is an `acts` loop, so for those two the break is one of
shape, not of validation.
_Avoid_: restoring matt's `research` / `implement` / `code-review`, deleting rpiv-pi's, treating the collision as a taste question

**the rest of matt's set** (`grill-with-docs`, `to-spec`, `to-tickets`, `triage`,
`wayfinder`, `tdd`, `prototype`, `handoff`, `codebase-design`, `domain-modeling`,
`writing-for-agents`):
Matt's, and nothing in this repo dispatches them by name. They are the human-driven half of
the flow, reached by `/skill:<name>` and by the agent's own routing.
_Avoid_: assuming they are interchangeable with the pipeline stages above

### Guidance

**guidance**:
A `.rpiv/guidance/**/architecture.md` file — a shadow tree mirroring the source layout,
injected into the session by rpiv-core's guidance engine. Not the same as a root
`AGENTS.md`, which Pi's own resource loader injects.
_Avoid_: architecture doc, CLAUDE.md, context file

**details**:
A `details.md` beside a guidance file. Deliberately NOT injected — read it on demand when
you need the module map or the per-file enumeration.
_Avoid_: appendix, deep dive, reference

**the ladder**:
Per directory depth, the first existing of `AGENTS.md > CLAUDE.md >
.rpiv/guidance/<sub>/architecture.md`. Depth 0 checks the shadow tree only, because Pi
already loads a root `AGENTS.md`/`CLAUDE.md`.
_Avoid_: precedence, resolution order

### Workflow

**pipeline**:
The developer-driven RPIV stage sequence (`discover → research → design → plan →
implement → validate`), invoked by `/skill:<name>`. Human-paced; no runner involved.
_Avoid_: workflow, flow, process

**workflow**:
A typed multi-stage graph run by `/wf` — `build`, `vet`, `polish`, `ship`, plus the meta
presets. Detached: every stage executes in its own spawned child session.
_Avoid_: pipeline, script, run

**stage**:
A node in a workflow graph. Distinct from a `### Phase`, which is a slice of work inside
a plan artifact.
_Avoid_: step, phase, node, task

**lane**:
The isolated child session a stage or fanout unit runs in. The interactive session is
launcher/observer only — the lane dock, browser and console are its whole surface.
_Avoid_: subagent, thread, worker

**gate**:
A named checkpoint whose pass predicate is a pure state-reading fold. Gates are the
routing layer between stages: they decide where a run goes, they do not do work.
_Avoid_: check, guard, blocker, assertion

**fanout unit**:
A skill dispatched once per unit by the workflow host — `design-slice`, `synthesize`,
`grade`, `amend`, `elaborate`. "Use as a fanout unit, not standalone."
_Avoid_: subtask, parallel agent, sub-stage

**contract**:
A skill's `contract:` frontmatter block (`produces` / `consumes`). It drives
contract-driven routing, stage-compatibility validation, and outcome derivation.
_Avoid_: schema, interface, signature

**artifactKind**:
The typed tag on what a contract produces — the value workflows route on.
_Avoid_: type, tag, category

**run budget**:
The three ceilings on backward edges: `maxBackwardJumps`, `maxLaps`, `maxIterations`.
Fresh per invocation, overridable per run.
_Avoid_: limit, timeout, retry count

### Tickets

**ticket**:
One work item, one file: `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01` in
dependency order. Written by `to-tickets`; the **spec** they are sliced from is written first by
`to-spec`. Field spellings are pinned in `docs/agents/issue-tracker.md`, and that file wins over
a skill's own embedded template.
_Avoid_: issue (that names a GitHub tracker item, and this repo has no tracker that stores one)

**spec**:
`.scratch/<feature-slug>/spec.md` — the problem statement a set of tickets is sliced from,
synthesized by `to-spec` from the conversation rather than from an interview.
_Avoid_: plan (a plan is an `.rpiv/artifacts/plans/` artifact, a pipeline output, and uncommitted)

**tracker**:
Where tickets live. Here that is local markdown under `.scratch/`, recorded in
`docs/agents/issue-tracker.md`. Not GitHub: issues are disabled on this repo, and a committed
file survives a clone.
_Avoid_: backlog, queue, GitHub issues

**.scratch/**:
The ticket artifact root, and deliberately **not** gitignored — a ticket is meant to outlive the
session and travel with a clone. That is the opposite posture from **.rpiv/artifacts/**, which is
ignored and local-only. The two roots are easy to confuse and the difference is load-bearing:
pipeline artifacts are scratch, tickets are durable.
_Avoid_: treating `.scratch/` as scratch space, adding it to `.gitignore`

### Conventions

**decision code**:
A parenthesized plan/phase citation such as `(c2r3)`. Banned in committed `.ts` —
comments state the contract in place instead.
_Avoid_: plan code, ticket id, reference

**ratchet**:
`scripts/file-size-baseline.json` over `packages/rpiv-pi`. Baselined files may only grow
by a small allowance per regeneration cycle; new files must fit a class cap. Every raise
is a visible baseline diff.
_Avoid_: budget, threshold, line cap

**thoughts/**:
The upstream-era artifact root (`thoughts/shared/…`), migrated to `.rpiv/artifacts/`.
Nothing writes it any more; `.gitignore`, `biome.json` and `goal-baseline.ts`'s scope
bookkeeping still tolerate it for trees that predate the move.
_Avoid_: thoughts/shared, using it for new artifacts
