# pi-monocoque

A standalone fork of `juicesharp/rpiv-mono`, shipping the `@hs1n/rpiv-*` Pi extensions as a
Pi source. This file is a pointer index, not a manual: the rules for working here are
injected per session from `.rpiv/guidance/`, and restating them here spends context twice.

## Before your first edit

- **Changing identity, naming, or provenance → read `FORK_NOTICE.md`.** This is a fork, not
  upstream. `rpiv`, `juicesharp` and the `@juicesharp` scope all name upstream's artifacts;
  nothing here may present itself as upstream's, and upstream's issues are not ours to file.
- **Naming a concept, or writing a doc → read `CONTEXT.md`.** Several words mean something
  narrower here than in Pi or in upstream's docs — `sibling`, `pipeline` vs `workflow`,
  `stage` vs a plan's `### Phase`, `guidance` vs `details`, `thoughts/`. It is deliberately
  not auto-injected, so nothing else will hand it to you.
- **Running a command, or unsure where something lives → read `.rpiv/guidance/architecture.md`.**
  It carries the command runbook, the layout, and the conventions. rpiv-core injects it at
  session start when loaded; reading it from disk is the fallback for when it was not. Each
  package and subsystem has a neighbouring `architecture.md` under `.rpiv/guidance/`, plus a
  `details.md` beside it that is deliberately NOT injected — read those when you need the
  module map rather than the rules.
- **Installing this into Pi → read `INSTALL-FORK.md`.** There is no publish path, so an
  instruction of the form `npm install @hs1n/rpiv-*` resolves nowhere here.

## Agent skills

### Issue tracker

Issues and specs live as GitHub issues, driven through `gh`. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context — one root `CONTEXT.md`, decisions under `docs/adr/`. See `docs/agents/domain.md`.

Triage labels are deliberately unconfigured: the `### Triage labels` sub-block and
`docs/agents/triage-labels.md` are written by Section B of `/setup-matt-pocock-skills`, which
is worth running when you start triaging incoming issues. Nothing is triaged here today.

## Checks that will fail your commit

The pre-commit hook runs all three; knowing them up front is cheaper than the round trip.

- `npm run check:decision-codes` — no parenthesized decision-code citation such as `(c2r3)`
  in a committed `.ts`. State the contract in the comment instead.
- `npm run check:host-provided-deps` — no host-provided package (`typebox`, the
  `@earendil-works/pi-*` trio) in an install-time dependency field; they are peer-pinned
  `"*"`, because an installed copy puts two live copies of one module in a single process.
- `npm run check:file-sizes` — `packages/rpiv-pi` sits on a size-growth ratchet. Split the
  file rather than raising the baseline as a reflex.
