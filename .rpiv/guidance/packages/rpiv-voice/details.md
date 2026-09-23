# rpiv-voice — module map and flow (NOT auto-injected)

Reference material split out of `architecture.md`. Read this when you are changing
the pipeline, the overlay, the entry point, or the locale wiring.

## Dependencies

- **`@earendil-works/pi-coding-agent`** (peer): `ExtensionAPI`, `ExtensionCommandContext` (`ctx.ui.custom`, `ctx.ui.notify`, `ctx.ui.pasteToEditor`, `ctx.hasUI`)
- **`@earendil-works/pi-tui`** (peer): `Container`, width-correct helpers, key matching
- **`@hs1n/rpiv-i18n`** (optional peer): dynamic-imported in `index.ts` + `state/i18n-bridge.ts`; package runs standalone if absent
- **`@hs1n/rpiv-config`** (runtime): `configPath`, `loadJsonConfigWithLegacyFallback`, `saveJsonConfig` — sole importer is `config/voice-config.ts`
- **`sherpa-onnx-node`** (`^1.13.0`, CJS, no upstream `.d.ts` — `audio/sherpa-onnx-node.d.ts` is an ambient mirror): Whisper int8 ONNX recognizer
- **`decibri`** (runtime): EventEmitter-shaped mic with built-in Silero VAD

## Module Structure

```
.                  — Pi entry (index.ts): top-level await registers locales from dir, default export wires registerVoiceCommand(pi)
audio/             — Mic capture + STT + model installer + hallucination filter + error/diagnostic log (only native/ML layer)
command/           — /voice orchestrator: voice-command (preflight→pipeline→paste), splash-runner, pipeline-runner (mic→STT loop)
config/            — Persisted user-config (0600, XDG read + one-way legacy fallback); no cache — every load re-reads disk; `__resetState` test hook
state/             — Canonical VoiceState + pure reducer + key-router + voice-session shell + i18n-bridge. selectors/ is a sub-layer
view/              — Overlay chrome + StatefulView<P> contract + props-adapter + screen-content-strategy. components/ is a sub-layer
locales/           — JSON translation maps loaded once at module init
```

## Pi Extension Entry (`index.ts`)

```ts
// Top-level await: locale registration MUST happen before default export runs.
// `/loader` subpath avoids pulling i18n-ui + pi-tui into the load graph.
try {
    const sdk = await import("@hs1n/rpiv-i18n/loader");
    sdk.registerLocalesFromDir(I18N_NAMESPACE, import.meta.url, { label: "rpiv-voice" });
} catch { /* SDK absent — t(key, fallback) returns English fallback */ }

export default function (pi: ExtensionAPI): void {
    registerVoiceCommand(pi);  // single registration; no tools, no session hooks
}
```

`registerLocalesFromDir` iterates the SDK's `SUPPORTED_LOCALES` — there is no
`registerStrings` call and no `loadLocale` helper; adding a locale needs no edit here.

## Command Flow (`/voice` → paste)

1. `pi.registerCommand("voice", { handler: (_args, ctx) => handleVoiceCommand(ctx) })`
2. `runPreflight` → `runWithSplash` mounts `SplashView` while downloading the model, booting STT engine, opening mic
3. `runDictationSession` opens `ctx.ui.custom`, constructs `VoiceSession` (owns state + reducer), and starts `startDictationPipeline`
4. Mic events (`data`/`speech`/`silence`/`close`/`end`/`error`) → `session.dispatchAction({ kind: "audio_chunk" | "audio_partial_transcript_set" | "audio_transcript_appended" })`
5. On commit: `done(VoiceResult)` resolves; caller checks `result.intent === "commit"` and `ctx.ui.pasteToEditor(text)`
