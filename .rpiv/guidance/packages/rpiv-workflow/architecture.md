# rpiv-workflow

Chains Pi skills into typed multi-stage workflows. Owns the `/wf` slash command
(flag grammar → parse → load → run), the jiti-based config loader, the runner +
state JSONL writer, and the authoring DSL (`defineWorkflow`, `produces`/`acts`/
`terminal`, `gate`, `defineRoute`, loop constructors `fanout`/`iterate`/`assess` +
the `fanin()` read modifier, `progress` lap hooks). Execution is detached: every
stage runs in its own spawned child session; the interactive session is
launcher/observer only. **Skill-agnostic — ships ZERO built-in workflows.** The
runner dispatches `/skill:<name>` via Pi's native skill loader; sibling packages
(`rpiv-pi`) contribute workflows via `registerBuiltIns(...)` /
`registerBuiltInsProvider(...)`.

Loaded by Pi via `pi.extensions: ["./extension.ts"]` — a thin entry pulling only the
two registrars; the barrel `index.ts` stays the embedder API surface.

The module map, the per-file dependency list, the full `/wf` flag grammar, the
export inventory, and the layer path table are in `details.md` beside this file —
NOT auto-injected. Read it when you are changing the loader, the runner, or the
command surface.

## Layer Vocabulary (who may set what)
Two file roles per non-built-in layer, merged in this order (later overrides
earlier): built-in → user packs → user config → project packs → project config.

- **Pack** files (`packs/*.ts`, alpha-sorted): default export `Workflow | Workflow[]`. The envelope form is hard-rejected.
- **Config** file (the one hand-edited file): default export `Workflow | Workflow[] | { workflows?, default?, skillAliases? }` — an envelope with at least one of `workflows` / `default` / `skillAliases` (alias-only is valid).

**Rules**: within a layer the config file wins by workflow name. **Only the config
file** may set the layer's `default` OR declare `skillAliases` — pack files
hard-reject both, which eliminates "who set this?" ambiguity. Defaults cascade
`project config > user config > first registered workflow`. Alias maps merge per-key
with project winning, and the merged map applies to every workflow (built-ins
included) BEFORE validation — it surfaces as the required
`LoadedWorkflows.skillAliases`.

## Run Budgets and Detached Execution (rules)
- Three budgets govern backward edges: `maxBackwardJumps` (waive-aware — a stage's `progress: () => "improved"` verdict waives it on re-entry), `maxLaps` (absolute, verdict-proof ceiling), `maxIterations`. All fresh per invocation, validated pre-flight, overridable per run by flags or embedder options.
- Per-unit `ModelSelection` applies at child-session creation, **never via global mutation**. The `/wf` handler holds the observer-only `WorkflowLauncherContext`; the SDK executor is looked up through the `execution-host.ts` provider seam. The UI contract is notify-only.
- Parallel fan-out results fold in **DECLARED index order** so `fanin` synthesis + resume stay deterministic. `retryHaltedUnits` re-dispatches soft-halted units with one collected row per attempt; units with `deps` dispatch in Kahn waves.

## Failure-Path Resilience
Every stage/unit failure flows through a four-rung ladder — **recover → remember →
preserve → gate**:

- **Recover (strikes-then-escalate).** A per-command bash watchdog tool-timeout is recoverable inside the abort-classification ladder (`sessions/` doc): bounded strikes, re-arm via `child.resetToolTimeout?.()`, re-prompt the SAME child, tail-recurse. Exhaustion escalates to `haltStageOrSoftHalt({ kind: "timeout" })`. A recovered stage records additive optional `bashTimeoutStrikes` on its completed row.
- **Remember (additive prompt injection).** A bounded failure memo is appended at the two failure-record writers (`recordFatalFailure` / `recordUnitHalt` in `audit.ts`) and rendered as an additive prompt suffix at the two session-construction chokepoints — and re-entered from a collected row's `errMsg` during the budget-aware resume fold. **ADDITIVE-ONLY**: zero memos ⇒ `""` ⇒ byte-identical prompt.
- **Preserve (death-scene artifact).** On any transition to failed, a forensic Markdown artifact is written under `<cwd>/.rpiv/artifacts/failures/` immediately after the memo, sourced PURELY from the persisted session JSONL. Synchronous, fail-soft, sidecar `.md` — never read by resume.
- **Gate (validation-retry).** A schema-validated `produces()` stage does not blind-retry against an unchanged worktree: one mechanism wraps each `askAgentToFix` retry with a worktree digest (tracked files AND `.rpiv/artifacts/`, minus `failures/`; git subprocess bounded at 10 s), another blocks a re-dispatch whose `lastGatedDispatch` matches. Both gates degrade to always-proceed when the digest is `undefined`; operator resume is excluded from the second.

**The two failure-record writers in `audit.ts` are the load-bearing seam** — they are
why a strike-exhausted failure picks up the memo and the death-scene artifact for
free. The integration is structural, at the writer, not at the strike site.

## Architectural Boundaries
- **Skill-agnostic** — ZERO built-in workflows ship from this package; siblings register via `registerBuiltIns(...)`
- **Pi-coupling: structural only** — the public type surface names ZERO `@earendil-works/pi-coding-agent` types; `host.test.ts` carries a compile-time tripwire that fails if Pi's types drift below the port shape
- **Five export entries, no per-module deep imports** — the exports map exposes `.`, `./startup`, `./registration`, `./runner`, and the test-only `./internal`; startup-time siblings use `/startup` or `/registration` so they never drag the runner (~530ms) onto the startup path. Per-module deep imports (e.g. `/api.js`) are NOT supported
- **Detached, never swapped** — stages execute in spawned child sessions; the parent ctx stays valid. Host implementations must supply `spawnChild` + `maxConcurrency`; the UI contract is notify-only
- **State trails are schema-versioned** — rows record under `STATE_SCHEMA_VERSION` (currently 3); resuming a run recorded under any previous schema is refused with a version mismatch, never mis-replayed (no in-place migration)
- **No foreground/background lanes** — questions from any stage (parallel units included) defer through the relay instead of grabbing the live UI
- **Loader never throws to its caller** — every load + validation error flows through `LoadedWorkflows.issues`; the runner gates on `severity === "error"` issues
- **Legacy `.rpiv-workflow/` advisory** — when legacy layouts still exist, the loader emits one-shot advisories carrying migration shells (`load/legacy.ts`); the dashed directory is no longer read. Sunset target: ~3 release cycles post-1.0

<important if="you are extending the /wf command surface (new flag or parse kind)">
1. Add the flag to `FLAG_EXTRACTORS` in `command.ts` (name + extractor); peeling, repeat-arbitration, and warning plumbing are generic
2. Thread the parsed value through `command-run.ts` into the run options (and `validateRunBudgets` if it is a budget); cap-vs-ceiling cross-warnings live in `command-run.ts`
3. Cover the permutation shapes in `command.test.ts` (leading/trailing/repeated/mid-position) — an exhaustive permutation property already exists for repeats
4. Update `MSG_*` constants in `messages.ts` for any new user-facing warning; audit by substring pin
</important>
