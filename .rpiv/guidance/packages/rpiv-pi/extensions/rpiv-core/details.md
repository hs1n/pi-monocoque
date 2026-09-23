# rpiv-core Extension — module map and internals (NOT auto-injected)

Reference material split out of `architecture.md` so the auto-injected block carries
only what decides whether a change is correct. Read this when you need to pick the
right module, trace a dependency edge, or work on the host plumbing.

## Monorepo Context

Lives inside `packages/rpiv-pi/`; sibling tool source is at `../../../rpiv-<name>/`.
This extension never statically value-imports a sibling from the entry graph —
`siblings.ts` regex-detects them in `~/.pi/agent/settings.json`. Adding a sibling
needs a `siblings.ts` entry plus a `peerDependencies` line pinned to `"*"` in
`rpiv-pi/package.json`. Version changes flow through `node scripts/release.mjs` at
monorepo root.

## Module Structure

Each capability is a source module + co-located `<feature>.test.ts`.

| module | owns |
|---|---|
| `index.ts` | Composer — no inline handlers, but encodes ordering invariants: session-capture before skill-bracket; the rpiv-workflow-dependent registrars (`register-built-in-workflows`, `skill-contracts-source`, `registerUserSkillContractsSource`) chained strictly in sequence inside an async IIFE (jiti half-initialized-barrel race) |
| `session-hooks.ts` | Lifecycle wiring + the `guidance.ts` / `git-context.ts` / `agents.ts` / `pipeline-pointer.ts` engines. Compaction only marks the exact SessionManager and defers one merged context block to its next `before_agent_start` — never `sendMessage` inside `session_compact` |
| `sdk-workflow-host.ts` | Sole Pi-SDK importer: child `AgentSession` per stage/fanout unit, bounded parallel, per-child watchdog with the `toolTimeout` + `resetToolTimeout` host-port twins, subagent usage subscription, deferring lane-relay UI |
| `run-lane-registry.ts` | Process-global in-memory run/lane/question state; seeds pending fan-out unit lanes at `fanout` `onLoopStart` (`seedPendingUnits`) |
| `session-capture.ts` | `session_start` capture of modelRegistry/uiContext/model, borrowed for per-child model resolution (replaced model-override's global `pi.setModel` flip) |
| `subagent-usage.ts` | Process-global subagent token accumulator on a Symbol slot; fed by per-child EventBus subscriptions; rolled into lane rows |
| `lane-*.ts` (family) | Lane UI: `belowEditor` dock (+dock-editor), `/lanes` switcher, self-windowing console, transcript replay live + disk-jsonl (`lane-transcript*`, `lane-tool-defs` renderer cache), progress/usage/streaming/failure, shared lane-list renderer, deferring relay-ui |
| `question-lifecycle.ts` | `workflow-question` lifecycle events from the registry via a `Symbol.for` global slot; the lane dock/console render them |
| `*-command.ts` / `models-*` / `skill-*` | Registrars: setup, update-agents, models-config(+validate,+sources), models-picker, skill-bracket, skill-contracts-source (+outcome-derivation, artifact-collector), register-built-in-workflows (+built-in-workflows) |
| `agent-enablement.ts` | Pure sibling-tool enablement map driving conditional frontmatter injection in `agents.ts` (currently empty) |
| `rpiv-models/` | Nested subdir for the `/rpiv-models` cascade picker: `command.ts`, `index.ts`, `items.ts`, `overrides.ts` (+ unit tests) |
| `built-ins/` | Extracted built-in-workflows compute clusters (gates, verdicts, checks, fixtures) — has its own architecture.md |
| `*.ts` (utilities) | Primitive helpers: siblings, package-checks, paths, pi-installer, prune-legacy-siblings, bash-timeout, banner, constants, frontmatter, utils |

## Dependencies

- **`@earendil-works/pi-coding-agent`**: `ExtensionAPI`, event-type guards, Pi SDK session machinery (`createAgentSession` — `sdk-workflow-host.ts` only). **`@earendil-works/pi-tui`**: static in the lane-*/picker UI modules. **`@earendil-works/pi-ai`** (peer): `Model` types + value imports (`getSupportedThinkingLevels` in `rpiv-models/items.ts`).
- **`@hs1n/rpiv-config`** (dependency): static value imports — `configPath` + `loadJsonConfigWithLegacyFallback` + `validateConfig` in `models-config.ts`; `parseModelKey` in `session-capture.ts` + `sdk-workflow-host.ts`; `loadJsonConfigWithLegacyFallback` + `modelKey` + `saveJsonConfig` in `rpiv-models/`.
- **`typebox`** (dependency `^1.1.24`): `Type`/`Static` schema for `models.json` in `models-config.ts`.
- **`@hs1n/rpiv-workflow`** (peer): guarded dynamic `import(...)` of `/startup` in `register-built-in-workflows.ts`, `workflow-execution-host.ts`, `lane-progress.ts`, `outcome-derivation.ts` (itself reached dynamically from `skill-contracts-source.ts`, keeping artifact-collector's static edge off the entry graph), `skill-contracts-source.ts`; of `/registration` in `models-config-sources.ts`; of `/runner` in `lane-switcher.ts` (rerun-failed-run callback). Degrades silently when absent (`isModuleNotFound` guard). Off-entry-graph modules statically value-import the peer — `built-in-workflows.ts`, `artifact-collector.ts`, and the whole `built-ins/` cluster (`/registration` + `/runner`; see the `built-ins/` architecture.md) — safe only because they are reached solely via those guarded dynamic imports; `skill-contracts-source.ts` sits on the entry graph and imports `/registration` types only.
- **`@hs1n/rpiv-warp`** — DELETED by this fork along with `workflow-question-warp-bridge.ts`.
- Node built-ins: `node:fs`, `node:path`, `node:url`, `node:os`, `node:child_process`.
- External processes: `git` (via `pi.exec`), `pi` CLI (via `spawn` for the installer), `node` (the build workflow's code-splice stage shells out to `skills/_shared/stitch-elaborations.mjs` via `execFileSync`).

Sibling *presence detection* stays filesystem-based (regex over settings); the only
sibling loaded at runtime is `rpiv-workflow`, always through a guarded optional
dynamic import.

## Consumers

- **Pi extension host**: loads via `package.json` `"pi": { "extensions": ["./extensions"] }`; calls `default export(pi: ExtensionAPI)` at session start — and again inside every detached child session, which is why registration must be root-gated + idempotent.

## Sibling registry mechanics

The registry covers registered extensions generally, not just family bookkeeping: it
also carries pinned third-party runtime deps the family needs installed — the
`@tintinweb/pi-subagents` Agent dispatcher, registered with a fork-detection regex,
whose unscoped legacy name rides `LEGACY_SIBLINGS` and is pruned on upgrade. A
parallel `LEGACY_SIBLINGS` registry drives prune-on-upgrade for superseded packages.

## Detached Execution (launcher/observer)

`workflow-execution-host.ts` installs the executor provider on the ROOT launcher's
`session_start` — gate: `if (!ctx.hasUI || isLaneRelayUiContext(ctx.ui)) return;` —
so a detached child re-loading rpiv-core can never overwrite the process-global
provider box. Per-unit models are resolved through the captured registry and
applied at child-session creation, never via a global `pi.setModel()` flip.

Each child's `ask_user_question` binds the deferring lane-relay UI: questions queue
+ badge in the lane dock, and the switcher replays them on switch-in.

Child bash commands run under a watchdog (`bash-timeout.ts`): 3-minute default,
overridable via `RPIV_BASH_TIMEOUT_MS`, clamped to 5 s–30 min. The watchdog's
host-port twins live in `sdk-workflow-host.ts`: `toolTimeout: () =>
watchdog.timedOut()` and `resetToolTimeout: () => watchdog.reset()` (a resumed
turn's new bash call re-arms a fresh timer on the same handle). `readSessionBranch`
(backed by `SessionManager.open(file).getBranch()`, fail-soft) is wired in
`workflow-execution-host.ts` and feeds `rpiv-workflow`'s death-scene artifact writer
the failed session's transcript without a live re-query.

Per-run concurrency is config-driven (`maxConcurrency`, default 6); a focus-gated
Ctrl-C tap aborts the active run.
