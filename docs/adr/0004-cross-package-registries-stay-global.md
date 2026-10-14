# The cross-package registries stay global, and `internal.ts` is not a debt to pay off

`@hs1n/rpiv-workflow/internal.ts` carried a KNOWN DEBT note claiming its six `__reset*` exports exist
because the registries are process-global singletons, and that "making them instantiable and
threading an instance through `loadWorkflows` would … shrink this file toward zero". Checked against
the writers, that plan cannot work. The four registry slots — built-ins, lifecycle,
execution-host, skill-contracts — are **written by rpiv-pi at load time**, through its own module
instance (`register-built-in-workflows.ts`, `lane-progress.ts`, `index.ts`,
`outcome-derivation.ts`, `skill-contracts-source.ts`). An instance threaded through `loadWorkflows`
would only be reachable by tests; production would keep the `Symbol.for` slot, so the four resets
stay, because rpiv-pi's tests exercise the production registration path. The remaining two resets
are not global-state problems at all: `strikeBudgets` is a `WeakMap` keyed by session identity, so
it is already self-cleaning (the reset exists only because a `WeakMap` has no `.clear()`), and
`overlayCache` is an mtime-validated **process**-level parse cache, where run-scoping would discard
hits.

## Considered Options

- **Instantiable registries threaded through `loadWorkflows`** — rejected: the writers are external,
  so the global cannot go and neither can the resets; it would change the `/` and `/runner`
  signatures for a test-only path.
- **Optional instance parameters on both the writer and the reader** — rejected: it would let
  in-package tests avoid the global, but rpiv-pi's tests must still drive the production
  registration path, so `test/setup.ts`'s resets remain. API churn on six modules without the
  promised payoff.
- **Run-scoping the two module-level caches** — rejected: the strike ledger is already object-keyed,
  and the overlay cache's mtime check is what makes it correct; per-run scoping would only remove
  cache hits.

## Consequences

The six exports stay, and the note in `internal.ts` now points here instead of inviting the change.
The trigger to revisit is a *third* package needing an isolated registry in **production** rather
than in a test — that would require a real instance threaded from the registration site, not an
optional parameter.
