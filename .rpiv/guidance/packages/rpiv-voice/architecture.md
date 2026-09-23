# rpiv-voice

Sibling Pi extension in `rpiv-mono`. **Opt-in sibling** — installed explicitly,
absent from the registry (not in `siblings.ts`, not peer-pinned by `rpiv-pi`). Only
package in the monorepo that owns native bindings (sherpa-onnx-node) + mic capture.

Registers a single `/voice` slash command: captures mic audio via `decibri`, runs
local Whisper STT via `sherpa-onnx-node`, renders a live transcript/equalizer
overlay, and pastes the committed text into the editor. Local-only; no cloud.

The module map, the dependency list, the entry-point code, and the command flow are
in `details.md` beside this file — NOT auto-injected. Read it when you are changing
the pipeline, the overlay, or the locale wiring.

## Module-Level State (rules)
- **There is no config cache.** `loadVoiceConfig()` re-reads disk on every call. The `globalThis[Symbol.for("rpiv-voice")]` cell in `config/voice-config.ts` has an exported `__resetState` wired into `test/setup.ts` `beforeEach`, but nothing writes to it — it is reset scaffolding, **not a config cache**.
- **`VoiceSession` is not a module singleton** — one per `/voice` invocation. The only real module-level state is the i18n-bridge's scope impl, intentionally not reset (no test relevance).
- **Config IO**: reads go through `loadJsonConfigWithLegacyFallback("rpiv-voice", "voice.json")` — `XDG_CONFIG_HOME` preferred, the legacy location read only when the XDG file is absent; writes are XDG-only via `configPath`. Persisted files are `0600`.

## Architectural Boundaries
- **`audio/` never reads canonical state** — pipeline-runner pushes deps in via `setPaused`/`setHallucinationFilterEnabled` setters
- **i18n at render time, never module top-level** — `t(key, fallback)` is invoked inside `description`/render paths (`i18n-bridge.ts:38-52`)
- **All SDK imports are soft** — every cross-package consumer wraps `await import("@hs1n/rpiv-…")` in try/catch
- **PreflightStage tagging** — `PreflightError` throws carry a `PreflightStage` string-literal union; user-facing messages branch on stage, with a generic fallback for non-`PreflightError` throws
- **No invariants.ts / replay.ts** — voice is overlay-scoped, not persisted; no post-compaction reconstruction
- **Config JSON-only keys round-trip** — `numThreads` (and any future non-draft key) is not part of `SettingsDraft`; the reducer re-reads persisted config at save time (`readPersistedConfig`) and `DRAFT_OWNED_CONFIG_KEYS` carries the draft-owned keys across the merge (`__proto__` skipped)

<important if="you are adding a new voice command or screen">
## Adding a Command / Screen
1. **New command**: add `command/<name>-command.ts` exporting `register<Name>Command(pi)`; call it from `index.ts`'s default export
2. **New screen**: add `view/components/<name>-view.ts` implementing `StatefulView<P>` (`setProps`, `render(w)`, `invalidate`/`handleInput` no-ops are fine)
3. Add a projection in `state/selectors/projections.ts` (see `.rpiv/guidance/packages/rpiv-voice/state/selectors/architecture.md`)
4. Register a `globalBinding({ component, select, predicate? })` in the screen wiring — never call `setProps` outside the adapter
5. Add a `ScreenKind` entry in `state/state.ts` + a `SCREEN_META` row in `state/screen-intent.ts` (footer hints) and route via `view/screen-content-strategy.ts` + `state/key-router.ts`
6. **New locale**: drop `locales/<code>.json` mirroring `en.json` keys — no `index.ts` edit needed (`registerLocalesFromDir` iterates the SDK's `SUPPORTED_LOCALES`)
</important>
