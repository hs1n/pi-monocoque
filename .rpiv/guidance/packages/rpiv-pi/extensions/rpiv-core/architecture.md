# rpiv-core Extension

Pi runtime orchestrator and detached-execution launcher/observer host. Owns zero
tools — every tool surface lives in a sibling plugin listed in `siblings.ts`, and
all workflow intelligence lives in `skills/`.

Wires the session lifecycle hooks (guidance injection, git-context injection,
pipeline-stage index, bundled-agent sync) and registers the `rpiv-*` slash commands
plus the non-prefixed `/lanes`. Every `/wf` stage runs in an isolated child session
spawned via the Pi SDK (`sdk-workflow-host.ts`); the interactive session stays a
launcher/observer with the lane dock, lane browser/console, and the
question-lifecycle stream. Hosts the model-management layer (`models.json`
validation, `/rpiv-models` picker, `/skill:` override bracket) and contributes the
four built-in `/wf` workflows (build / vet / polish / ship) + skill contracts into
the `@hs1n/rpiv-workflow` sibling via guarded dynamic imports. Pipeline-stage skills
carry `disable-model-invocation` — gated to explicit `/skill:<name>` or workflow
dispatch, with a compact stage index injected at session start
(`pipeline-pointer.ts`).

**The module map, the per-file dependency enumeration, and the detached-execution
internals are in `details.md` beside this file — NOT auto-injected.** Read it when
you need to decide which module owns a change, or when you touch the host plumbing.

## Architectural Boundaries
- **Editing `built-in-workflows.ts` or any `workflows/*.ts` module requires the workflow-invariant check**: after any change to them, run `node packages/rpiv-pi/skills/elaborate/_helpers/validate-workflow-invariant.mjs` — it re-derives the live built-in workflows + skill contracts and surfaces `route-reads-unvalidated-data` (and other) validation issues before they ship. This is the project-specific invariant check the `elaborate`/`implement` self-check protocol asks the guidance to name.
- **NO business logic in the composer**: orchestration only — every capability owns its own registrar module. `index.ts` is a thin wiring file that still encodes ordering invariants (session-capture before skill-bracket; the rpiv-workflow-dependent registrars chained strictly in sequence inside an async IIFE to avoid a jiti half-initialized-barrel race)
- **NO `ExtensionAPI` in pure-utility modules**: helpers (sibling registry, package checks, agent sync, installer, legacy pruner) take primitives only; the guidance engine takes `pi` explicitly
- **Sibling imports are guarded + optional only**: presence detection is settings ∪ loaded (never an import — `sourceInfo` paths and `globalThis` marker slots). No file statically reachable from `index.ts` may value-import a sibling — enforced by `sibling-import-graph.test.ts`; runtime loads (`rpiv-workflow`) are guarded dynamic imports that degrade silently when absent (`isModuleNotFound`)
- **Hooks owning process-global state are root-gated + idempotent**: registered on the root launcher's `session_start` (`!ctx.hasUI || isLaneRelayUiContext(ctx.ui)` → return), skipped for detached children, safe under `/reload` — never in a module-load IIFE. A detached child re-loading rpiv-core must never overwrite the process-global executor provider
- **Hooks also register once**: Pi calls the default export at session start *and* again inside every detached child session, which is why every registration is root-gated + idempotent
- **Per-unit models are applied at child-session creation**, resolved through the captured registry — never via a global `pi.setModel()` flip
- **Cross-module state lives on `globalThis[Symbol.for(...)]` slots**, never module-level variables. `session-capture.ts` and `lane-tool-defs.ts` are the two documented exemptions (deliberately plain module-level state)
- **NO tools registered here**: rpiv-core is a pure orchestrator — new tools belong in sibling plugins (registration pattern: `.rpiv/guidance/packages/rpiv-advisor/architecture.md`)

<important if="you are adding a new tool to this extension">
## Adding a New Tool
New tools do not belong in rpiv-core. Add the tool to a sibling plugin instead:
1. Add it to an existing sibling or create a new sibling plugin (see `.rpiv/guidance/architecture.md`)
2. Add one entry to `SIBLINGS` in `siblings.ts` — presence detection, missing-plugin warning, and `/rpiv-setup` all pick it up automatically (a sibling with no tool or extension command must also set a `marker` slot on load and name it in its entry, as rpiv-args does)
3. Pin the package in `rpiv-pi/package.json` `peerDependencies` as `"*"`
</important>

<important if="you are adding a new slash command to this extension">
## Adding a New Slash Command
1. Create a new registrar module exporting `registerMyCommand(pi: ExtensionAPI): void` — the composer is a thin wiring file with no inline handlers
2. Wire it from the composer with one call
3. Guard interactive operations: `if (!ctx.hasUI) { ctx.ui.notify("…", "error"); return; }`
4. User-facing strings live in the shared constants module or as named arrow-message helpers — no inline template literals in logic
5. Handler returns `void`; use `ctx.ui.notify` / `ctx.ui.input` / `ctx.ui.confirm` / `ctx.ui.custom<T>`
</important>

<important if="you are adding a new session lifecycle hook to this extension">
## Adding a Session Hook
1. Add the `pi.on("event_name", async (event, ctx) => { … })` line inside the owning registrar — `session-hooks.ts` for injection-style hooks, otherwise the feature's own module (multiple registrars subscribe `session_start`: session-hooks, session-capture, lane-switcher, lane-progress, models-config-validate, workflow-execution-host)
2. Extract the handler body into a named helper in the same file — `pi.on` lines are pure wiring
3. Events used here: `session_start`, `session_compact`, `session_shutdown`, `tool_call`, `before_agent_start` (session-hooks); `input` + `agent_end` (skill-bracket). rpiv-core has no tool state to reconstruct, so branch-replay events are not subscribed
4. If the hook owns process-global state, root-gate it (`!ctx.hasUI || isLaneRelayUiContext(ctx.ui)` → return) and make it idempotent — every detached child re-loads rpiv-core
5. If the registrar dynamically imports `rpiv-workflow`, chain it after the others in the composer's sequential IIFE — concurrent imports race jiti's half-initialized barrel
6. `before_agent_start` can return `{ message: { customType, content, display: false } }` to inject a hidden LLM-only context message
7. `session_compact` MUST NOT call `pi.sendMessage`: auto-recovery treats those as queued steering items. Store only per-session identity state there, then merge any restored guidance/pointer/Git context into one `before_agent_start` return on the next real user turn
</important>

<important if="you are adding a new pure utility module to this extension">
## Adding a Utility Module
1. Create the module with no `ExtensionAPI` import
2. Every function returns a value or `void`; never throws — catch all errors and return a safe default
3. Resolve package paths via `import.meta.url` + `fileURLToPath` — never `__dirname`
4. Co-locate the test next to the source
</important>
