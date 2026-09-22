# rpiv-warp

## Monorepo Context
Published opt-in Pi extension in `rpiv-mono` (`"private": false`). Lockstep version with the rest of the `@hs1n/rpiv-*` family — never bump independently. **Opt-in sibling** — intentionally absent from `siblings.ts`, NOT peer-pinned in `rpiv-pi/package.json`, NOT auto-suggested by `/rpiv-setup`. Users opt in explicitly via `pi install @hs1n/rpiv-warp`. Joins lockstep + shared check/test/release infrastructure purely through filesystem auto-discovery (`readdirSync("packages")` in the release scripts; `packages/*` glob in the Vitest config).

## Responsibility
Subscribes to Pi lifecycle events and drives two terminal channels to `/dev/tty` (stdout on Windows): Warp's structured `OSC 777` notification (`\x1b]777;notify;<title>;<body>\x07`, driven by lifecycle events — not 1:1: `agent_start` fans out a defensive `session_start` re-announce plus `prompt_submit`, and post-abort `agent_end` drains a `tool_complete` per pending blocking call before the stop) AND a tab-title activity spinner — `OSC 0` title rewrites every 160ms wrapped in `CSI 22;0t`/`CSI 23;0t` title-stack push/pop. A config-driven blocking-tool allowlist + heartbeat interval keep Warp's badge/activity state honest across blocking tools and idle turns. Outside Warp (env-var gate) or on broken Warp builds (per-channel hard-coded thresholds) the extension is a silent no-op. Zero tools, zero commands, zero widgets — but no longer purely an event listener: `index.ts` also exports a direct-call library API (`WorkflowQuestionTransport` / `createWorkflowQuestionTransport`, see below), reachable because `package.json` has an `"exports": { ".": "./index.ts" }` map.

## Dependencies
- **`@earendil-works/pi-coding-agent`** (peer): `ExtensionAPI`, all event types
- **`@hs1n/rpiv-config`** (runtime dep): `configPath`, `loadJsonConfigWithLegacyFallback` for the blocking-tool/heartbeat config (`config.ts`) — name-keyed (`"rpiv-warp"`), honors `XDG_CONFIG_HOME` with a one-way legacy `~/.config` fallback
- **`node:fs`**, **`node:path`** — only other deps are Node built-ins; no UI deps. fs calls are namespace-prefixed for grep-ability and to let tests intercept via `vi.mock`
- No `pi-ai`, `pi-tui`, `typebox` peer deps — no models, no UI, no tools

## Consumers
- **Pi extension host**: loads via `pi.extensions: ["./index.ts"]` — except in detached workflow child sessions: `"pi": { "ambientObserver": true }` in `package.json` self-declares launcher-only observer status, and rpiv-pi's `sdk-workflow-host.ts` (manifest flag + `CHILD_AMBIENT_EXTENSION_DENYLIST`) skips loading it in children. Warp observes only from the launching session
- **Warp terminal**: consumes the `OSC 777` notification + `OSC 0` title / `CSI 22;0t`/`23;0t` title-stack bytes on `/dev/tty` (intercepted at the terminal-emulator layer, never reaches stdout/stderr capture). Title-stack push/pop is also honored by iTerm2, Ghostty, tmux, Linux console; terminals that lack it ignore the CSI silently
- **`packages/rpiv-pi/extensions/rpiv-core/workflow-question-warp-bridge.ts`**: dynamically imports `@hs1n/rpiv-warp` (guarded by `isModuleNotFound` — a clean install without this opt-in package degrades to a silent no-op) and drives `createWorkflowQuestionTransport` to badge parked workflow questions

## Module Structure
Flat package — files split by concern (each ≤5-word verb phrase) at a single architectural level; no state/tool/view division.
```
protocol.ts       — env detection, version parsing, broken-version gating, version negotiation
warp-notify.ts    — transport: OSC 777 / OSC 0 / CSI title-stack emission, /dev/tty open-write-close
payload.ts        — per-event envelope builders (`baseEnvelope` delegates to the identity-independent `runEnvelope`), workflow-question builders, content extraction, truncation
config.ts         — getBlockingTools / getHeartbeatMs: blocking-tool allowlist + heartbeat (via rpiv-config)
title-spinner.ts  — startSpinner / stopSpinner: single idempotent ticker, unref()'d timer
index.ts          — registration shim: composer wiring event handlers, heartbeat interval, and blocking-tool drain to helpers; also hosts the `createWorkflowQuestionTransport` factory
```

## Workflow-Question Transport
Run-keyed OSC 777 emitter for rpiv-pi's `workflow-question-warp-bridge`: `session_id` is the workflow **runId**, NOT the launcher session — Warp treats each concurrent workflow run as its own logical session, so each run's Blocked badge is independent. `asked(runId)` fires on a run's first parked question (0→≥1) and emits a defensive `session_start` then `question_asked`; `resolved(runId)` fires when the run's last outstanding question clears (≥1→0) and emits `tool_complete` with `tool_name: "ask_user_question"` but no `tool_input` (the bridge aggregates — it has no per-question input). Every method is gated per-call on `detectWarpEnvironment().supportsStructured` so the bridge can call unconditionally; the factory is cheap and holds no state. Builders live in `payload.ts` and compose `runEnvelope` so they share the root flow's field shape.

## Architectural Boundaries
- **Pure environment detection** — env vars are read at call sites, never cached at module level. Any timer/capture state lives behind an exported `__resetState` so test isolation can clear it
- **Open-and-close per emission** — no fd cache for `/dev/tty`; matches the bash precedent and avoids cross-emission state
- **Silent skip on every failure** — outside Warp, broken Warp build, unavailable `/dev/tty`, unsupported platform: zero side effects, zero log noise. Notification failure must never propagate to the agent loop
- **`getBranch()` for content extraction** — never `getEntries()`. Matches the rest of rpiv-mono extensions that read conversation state
- **Spinner brackets the agent turn** — `agent_start` starts it / `agent_end` stops it; a blocking tool (`tool_call`/`tool_execution_end` against the allowlist) pauses then resumes it. Heartbeat interval follows the same start/pause/resume/stop cadence; `session_shutdown` tears down spinner + heartbeat + idle timer
- **Blocking-tool drain on abort** — ESC/abort during a blocking tool skips `tool_execution_end`, so `agent_end` drains outstanding blocking calls (emits `tool_complete` per pending call) before the stop notification, clearing the stale "Blocked" badge
- **Programming-by-intention** — every exported function is named with a short verb phrase; composer handlers compose named helpers, never inline conditional ladders

<important if="you are adding a new event subscription to rpiv-warp">
## Adding a New Event
1. Add the literal to the `WarpEvent` union in the protocol module
2. Add a builder for that event in the payload module composing the base envelope + event-specific fields
3. Register a `pi.on("<pi_event>", ...)` handler in the composer — handler body is 3-5 lines, calls the builder and the OSC 777 writer via the closure-captured environment
4. Add a row to the end-to-end test suite asserting the OSC 777 byte format
5. If the event needs filtering, add to the relevant named constant (e.g., the tool-name allowlist) — never inline a `===` literal in the handler
</important>

<important if="you are touching /dev/tty I/O or fs imports in this package">
## fs / /dev/tty Conventions
- fs is imported as a namespace so every call is greppable and so tests can intercept it
- Every fs call in the writer is wrapped in a `try/catch` that swallows errors — notification failure must never reach the agent loop
- The writer opens `/dev/tty`, writes, and closes per emission (no fd cache)
- Unsupported platforms must short-circuit **before** any fs call
</important>

<important if="you are promoting rpiv-warp from opt-in to auto-suggested sibling">
## Joining the SIBLINGS Registry
1. Add an entry to `SIBLINGS` in `packages/rpiv-pi/extensions/rpiv-core/siblings.ts` (pkg, matches regex, provides string) — `/rpiv-setup` and the missing-plugin warning pick it up automatically
2. Pin `@hs1n/rpiv-warp` in `packages/rpiv-pi/package.json` `peerDependencies` as `"*"`
3. Update CHANGELOG `[Unreleased]`; the next `node scripts/release.mjs` ships the change
</important>
