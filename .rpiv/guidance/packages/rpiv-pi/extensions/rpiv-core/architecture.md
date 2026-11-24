# rpiv-core Extension

Pi runtime orchestrator. Owns zero tools — every tool surface lives in a sibling
plugin listed in `siblings.ts`, and all orchestration intelligence lives in
`skills/`.

Wires the session lifecycle hooks (guidance injection, git-context injection,
pipeline-stage index, bundled-agent sync) and registers the `rpiv-*` slash
commands. Hosts the model-management layer (`models.json` validation,
`/rpiv-models` picker, `/skill:` override bracket). Pipeline-stage skills
carry `disable-model-invocation` — gated to explicit `/skill:<name>`, with a
compact stage index injected at session start (`pipeline-pointer.ts`). **A
bundled skill can also be SHADOWED**: a same-named copy under
`<cwd>/.agents/skills > <cwd>/.pi/skills > ~/.agents/skills >
~/.pi/agent/skills` outranks the installed package, so `/skill:<name>` runs a
body the developer did not intend. `session_start` probes those directories
(`skill-shadow.ts`, pure) and `session-hooks.ts` warns in the action-required
banner — the runtime half of the trap `skills/matt-pocock/README.md` documents.

The module map and the per-file dependency enumeration are in `details.md`
beside this file — NOT auto-injected. Read it when you need to decide which
module owns a change.

## Architectural Boundaries
- **NO business logic in the composer**: orchestration only — every capability owns its own registrar module. `index.ts` is a thin wiring file that still encodes one ordering invariant: session-capture before skill-bracket
- **NO `ExtensionAPI` in pure-utility modules**: helpers (sibling registry, package checks, agent sync, installer, legacy pruner) take primitives only; the guidance engine takes `pi` explicitly
- **Sibling imports are guarded + optional only**: presence detection is settings ∪ loaded (never an import — `sourceInfo` paths and `globalThis` marker slots). No file statically reachable from `index.ts` may value-import a sibling — enforced by `sibling-import-graph.test.ts`
- **Hooks also register once**: registration stays idempotent, safe under `/reload` and under a second load of the extension in one process — never in a module-load IIFE
- **Cross-module state lives on `globalThis[Symbol.for(...)]` slots**, never module-level variables. `session-capture.ts` is the one documented exemption (deliberately plain module-level state)
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
1. Add the `pi.on("event_name", async (event, ctx) => { … })` line inside the owning registrar — `session-hooks.ts` for injection-style hooks, otherwise the feature's own module (multiple registrars subscribe `session_start`: session-hooks, session-capture, models-config-validate)
2. Extract the handler body into a named helper in the same file — `pi.on` lines are pure wiring
3. Events used here: `session_start`, `session_compact`, `session_shutdown`, `tool_call`, `before_agent_start` (session-hooks); `input` + `agent_end` (skill-bracket). rpiv-core has no tool state to reconstruct, so branch-replay events are not subscribed
4. Make the hook idempotent — it must survive `/reload` and a second load in one process
5. `before_agent_start` can return `{ message: { customType, content, display: false } }` to inject a hidden LLM-only context message
6. `session_compact` MUST NOT call `pi.sendMessage`: auto-recovery treats those as queued steering items. Store only per-session identity state there, then merge any restored guidance/pointer/Git context into one `before_agent_start` return on the next real user turn
</important>

<important if="you are adding a new pure utility module to this extension">
## Adding a Utility Module
1. Create the module with no `ExtensionAPI` import
2. Every function returns a value or `void`; never throws — catch all errors and return a safe default
3. Resolve package paths via `import.meta.url` + `fileURLToPath` — never `__dirname`
4. Co-locate the test next to the source
</important>
