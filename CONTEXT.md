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

### Skill ownership

Two skill sources are installed here — `~/.agents/skills` (Matt Pocock's engineering skills)
and `packages/rpiv-pi/skills/` — and three names exist in both: `research`, `implement`,
`code-review`. **Nothing collides today**, because matt's copies of those three are not on
disk. That absence is load-bearing, not hygiene.

**research**, **implement**, **code-review**:
**Neither side may be swapped for the other.** User-level skills outrank the installed
package — `<cwd>/.agents/skills > <cwd>/.pi/skills > ~/.agents/skills > ~/.pi/agent/skills >
installed package (this fork)` (`scripts/fork-own-skill.mjs`) — so restoring
`~/.agents/skills/research` shadows rpiv-pi's body, while the `contract:` the graphs
validate against is harvested by a separate provider that finds nothing to replace it with,
matt's skills declaring none.

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
