# pi-monocoque

This repo is an independent fork of `juicesharp/rpiv-mono`. It ships the `@hs1n/rpiv-*` Pi
extensions as a Pi source. This file is an index of pointers, not a manual. rpiv-core injects the
rules for this repo from `.rpiv/guidance/` in each session. If this file repeats them, the
context holds them two times.

## Before your first edit

- **Before you change identity, names or provenance, read `FORK_NOTICE.md`.** This repo is a
  fork, not upstream. `rpiv`, `juicesharp` and the `@juicesharp` scope name the artifacts of
  upstream. Nothing here can show itself as upstream. Do not send issues to upstream.
- **Before you name a concept or write a doc, read `CONTEXT.md`.** Some words have a narrower
  meaning here than in Pi or in the upstream docs: `sibling`, `pipeline` vs `workflow`, `stage`
  vs the `### Phase` of a plan, `guidance` vs `details`, and `thoughts/`. Nothing injects
  `CONTEXT.md`, so you must read it yourself.
- **Before you run a command, or when you do not know where something is, read
  `.rpiv/guidance/architecture.md`.** It has the conventions and the rows whose *shape* is
  important. Other files have the details:
  - the command table, one row per guard: `.rpiv/guidance/scripts/architecture.md`
  - the layout tree and the new-package checklist: `.rpiv/guidance/details.md`
  - the test contract: `.rpiv/guidance/test/architecture.md`

  When rpiv-core is loaded, it injects `.rpiv/guidance/architecture.md` at session start. If it
  did not, read the file from disk. Each package and subsystem has an `architecture.md` under
  `.rpiv/guidance/`. Each also has a `details.md` beside it, and rpiv-core does NOT inject that
  file. Read `details.md` when you need the module map, not the rules.
- **Before you install this repo into Pi, read `INSTALL-FORK.md`.** The repo has no publish
  path. Thus an npm install of an `@hs1n/rpiv-*` package name fails here.

## Agent skills

### Issue tracker

Issues and specs are Markdown files under `.scratch/`. They are committed, not ignored. See
`docs/agents/issue-tracker.md`.

### Triage labels

The repo has five canonical triage roles, with their default strings. See
`docs/agents/triage-labels.md`.

### Domain docs

The repo has one context: one root `CONTEXT.md`, and decisions under `docs/adr/`. See
`docs/agents/domain.md`.

## Checks that will fail your commit

The pre-commit hook runs these four checks. Know them before you commit, so you do not need a
second attempt.

- `npm run check:decision-codes`: a committed `.ts` file must not cite a decision code in
  parentheses, such as `(c2r3)`. State the contract in the comment.
- `npm run check:host-provided-deps`: an install-time dependency field must not hold a
  host-provided package (`typebox` or the three `@earendil-works/pi-*` packages). They are
  peer-pinned to `"*"`. An installed copy puts two live copies of one module in one process.
- `npm run check:file-sizes`: `packages/rpiv-pi` has a ratchet on file growth. Split the file.
  Do not raise the baseline as the first fix.
- `npm run check:unused-deps`: the package that imports a dependency declares it. A manifest
  must not declare a package that its own sources do not import. Registered siblings and
  host-provided names are exceptions.
