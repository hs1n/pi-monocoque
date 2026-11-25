# pi-monocoque

pi-monocoque is an independent fork of `rpiv-mono`. It ships the `@hs1n/rpiv-*` family of Pi
extensions as a Pi source. Some words below have a narrower meaning here than in Pi or in the
upstream docs. When two meanings conflict, this file decides. `.rpiv/guidance/**` has the
details (rpiv-core injects it), and `FORK_NOTICE.md` has the provenance. This file only sets
the vocabulary.

## Language

### Provenance

**upstream**:
`juicesharp/rpiv-mono`, stopped at v2.13.8 (`2d88b79c`). The maintainer removed the `upstream`
remote after the final sync. No merge path exists.
_Avoid_: origin, parent repo, source

**@juicesharp**:
The npm scope of upstream. It identifies the artifacts of upstream. This fork must not use it.
_Avoid_: the old scope, the original scope

### Packages

**sibling**:
A Pi extension package that is registered in `extensions/rpiv-core/siblings.ts`. That registry
is the single source of truth. One entry controls `/rpiv-setup`, the missing-sibling warnings
and presence detection.
_Avoid_: plugin, module, addon, dependency

**opt-in sibling**:
A package that has the lockstep version and the shared CI. It is not in `siblings.ts`, not in
the `peerDependencies` of `rpiv-pi`, and not in the root `pi` manifest. Thus `/rpiv-setup` and a
git install do not install it. Install it with `scripts/fork-pi-install.sh --with <name>`. At
this time, `rpiv-btw` is the only one.
_Avoid_: optional package, disabled plugin

**legacy sibling**:
A replaced package name in `LEGACY_SIBLINGS`. `/rpiv-setup` removes it from the settings. At
this time, the legacy siblings are `pi-subagents` and `rpiv-workflow`.
_Avoid_: deprecated sibling, old name

**host-provided**:
A package that Pi ships and maps to its own copy at load time: `typebox`, the three
`@earendil-works/pi-*` packages and the legacy `@mariozechner/*` names. Always declare it in
`peerDependencies: "*"`, never in `dependencies`. An installed copy puts two live copies of one
module in one process.
_Avoid_: bundled, vendored, built-in

**lockstep**:
Each `packages/*/package.json` has the same `version` as the root `package.json`. You edit the
version only in the root. `sync-versions.js` writes it to all other manifests, and `--check`
verifies them. Nothing is published, so the version is a marker, not a release.
_Avoid_: semver, independently versioned

### Side calls

**side call**:
A single model call that an extension makes outside the main transcript. It has its own prompt
and no tools, and it writes nothing back. `rpiv-advisor` and `rpiv-btw` are the two surfaces
that make side calls. `rpiv-side-call` is the shared module that selects how to make a side call
on each host version.
_Avoid_: sidecall, sub-call, secondary request, side conversation (the `/btw` overlay is its UI, not the call)

### Skill ownership

This repo installs three skill sources:

- `skills/matt-pocock/`: the engineering skills of Matt Pocock. The repo has a copy, and the
  root `pi` manifest ships it. The fork edits one file of the set, `grilling/SKILL.md`.
- `skills/skill-master/`: a Pi-native fork of the `skill-creator` skill by Anthropic. The root
  manifest ships it. The fork edits it and does not keep it verbatim.
- `packages/rpiv-pi/skills/`.

Three names exist in both the matt-pocock set and the rpiv-pi set: `research`, `implement` and
`code-review`. **No collision occurs at this time**, because the copied set does not include
these three. This omission is necessary, not only clean. When you refresh the copied set, check
it first.

**research**, **implement**, **code-review**:
**Do not replace one side with the other.** User-level skills have a higher precedence than the
installed package. The order is `<cwd>/.agents/skills > <cwd>/.pi/skills > ~/.agents/skills >
~/.pi/agent/skills > installed package (this fork)` (`scripts/fork-own-skill.mjs`). The copied
set has the **lowest** precedence, because it is part of the installed package. Thus it is
correct only while no copy with the same name has a higher precedence. If you put `research`,
`implement` or `code-review` into `~/.agents/skills` or into a project `.agents/skills`, that
body hides the rpiv-pi body. The skills of Matt Pocock describe a different method with the same
name, and nothing makes the two agree.

This is also why the copied set does not include the three names. A copy at a higher precedence
wins `/skill:<name>` with no warning, and `/skill:<name>` is the only path that dispatches a
skill. `npm run check:skill-names` guards the repo. At `session_start`, rpiv-core shows a warning
when a copy outside the package hides a bundled skill.
_Avoid_: restoring matt's `research` / `implement` / `code-review`, deleting rpiv-pi's, treating the collision as a taste question

**the rest of matt's set** (`grill-with-docs`, `to-spec`, `to-tickets`, `triage`,
`wayfinder`, `tdd`, `prototype`, `handoff`, `codebase-design`, `domain-modeling`,
`writing-for-agents`):
These are the skills of Matt Pocock. Nothing in this repo dispatches them by name. They are the
part of the flow that a person controls. You start them with `/skill:<name>`, or the agent
selects them.
_Avoid_: assuming they are interchangeable with the pipeline stages above

### Guidance

**guidance**:
A `.rpiv/guidance/**/architecture.md` file. These files make a shadow tree that copies the
source layout. The guidance engine of rpiv-core injects them into the session. A guidance file
is not the same as a root `AGENTS.md`. The resource loader of Pi injects the root `AGENTS.md`.
_Avoid_: architecture doc, CLAUDE.md, context file

**details**:
A `details.md` file beside a guidance file. rpiv-core does NOT inject it. Read it when you need
the module map or the list of files.
_Avoid_: appendix, deep dive, reference

**the ladder**:
At each directory depth, the first file that exists from `AGENTS.md > CLAUDE.md >
.rpiv/guidance/<sub>/architecture.md`. At depth 0, the ladder checks only the shadow tree,
because Pi already loads a root `AGENTS.md` or `CLAUDE.md`.
_Avoid_: precedence, resolution order

### Multi-stage work

**pipeline**:
The RPIV stage sequence that the developer controls (`discover → research → design → plan →
implement → validate`). You start each stage with `/skill:<name>`. A person sets the pace, and
no runner is used. For multi-stage work across more than one skill, the agent uses the Pi
`Agent` and `SubagentWorkflow` tools. No declared graph controls it.
_Avoid_: workflow, flow, process

### Tickets

**ticket**:
One work item in one file: `.scratch/<feature-slug>/issues/<NN>-<slug>.md`. The numbers start at
`01`, in dependency order. `to-tickets` writes the tickets. First, `to-spec` writes the **spec**
that the tickets come from. `docs/agents/issue-tracker.md` sets the field names. If that file
and the template in a skill do not agree, the file is correct.
_Avoid_: issue (that names a GitHub tracker item, and this repo has no tracker that stores one)

**spec**:
`.scratch/<feature-slug>/spec.md`: the problem statement that a set of tickets comes from.
`to-spec` writes it from the conversation, not from an interview.
_Avoid_: plan (a plan is an `.rpiv/artifacts/plans/` artifact, a pipeline output, and uncommitted)

**tracker**:
The location of the tickets. Here, that is local Markdown under `.scratch/`, as
`docs/agents/issue-tracker.md` records. It is not GitHub. Issues are disabled on this repo, and
a committed file stays in each clone.
_Avoid_: backlog, queue, GitHub issues

**.scratch/**:
The root for ticket artifacts. It is intentionally **not** in `.gitignore`, because a ticket
must stay after the session and go with each clone. **.rpiv/artifacts/** is the opposite: Git
ignores it, and it stays local. Do not confuse the two roots. Pipeline artifacts are temporary,
and tickets are permanent.
_Avoid_: treating `.scratch/` as scratch space, adding it to `.gitignore`

### Conventions

**decision code**:
A plan or phase citation in parentheses, such as `(c2r3)`. Committed `.ts` files must not have
one. A comment states the contract in place.
_Avoid_: plan code, ticket id, reference

**ratchet**:
`scripts/file-size-baseline.json`, which applies to `packages/rpiv-pi`. A file in the baseline
can grow only by a small allowance in each regeneration cycle. A new file must fit a class
limit. Each increase shows as a diff of the baseline.
_Avoid_: budget, threshold, line cap

**thoughts/**:
The artifact root from the upstream era (`thoughts/shared/…`). Its contents moved to
`.rpiv/artifacts/`. Nothing writes it now. `.gitignore` and `biome.json` still accept it, for
trees from before the move.
_Avoid_: thoughts/shared, using it for new artifacts
