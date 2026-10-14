# rpiv-side-call

## Monorepo Context
Library (not published) in `pi-monocoque`. Lockstep version with the rest of the `@hs1n/rpiv-*` family — never bump independently. NOT a Pi extension — no `pi` field, no `siblings.ts` entry, no line in the root `pi` manifest, not auto-suggested by `/rpiv-setup`. Consumers declare it in `dependencies` explicitly. The family's siblings may not import each other at runtime; a library package is the sanctioned way to share behaviour, and this is the third one (see `docs/adr/0001-shared-family-behaviour-lives-in-library-packages.md`).

## Responsibility
The host-version-tolerant surface a sibling uses to make a one-off side call outside the main transcript. Three jobs behind one seam:

1. **Which path this host takes** — `resolveSideCall(modelRegistry)` reports `facade` or `global` and hands back the callable. A `facade` host keeps its canonical `ModelRuntime` behind the extension `ModelRegistry`'s runtime-private `runtime` slot and applies credential-derived request fields itself, so the caller passes only `{ signal }`; a `global` host needs explicit `apiKey`/`headers`. The mode is returned **synchronously** — a caller checks it before deciding whether a missing literal API key is fatal — while the callable is a **thunk**, so the global import runs only when there is no facade and only inside the caller's own error boundary.
2. **The global fallback** — `/compat` first, package root only on a module-resolution failure, rethrow on any other `/compat` error so a real init failure surfaces instead of being masked. `loadIsContextOverflow()` mirrors the path and degrades to `undefined` when the host simply lacks the export.
3. **Tool-declaration stripping** — `stripToolDeclarations(messages)` drops the `toolsAdded`/`toolsRemoved` deltas Pi >= 1.0 writes onto transcript `system` messages, so `tools: []` actually leaves the executor's tools uncallable (#295). Prompt text and `content` references are preserved.

Stateless — no module-level mutable state, no `globalThis` caches, no side effects at import.

## Dependencies
- **`@earendil-works/pi-ai`** (`peerDependencies: "*"`, host-provided): resolved **lazily** through `await import(...)` against the HOST's copy — never a static value import, because Pi aliases the specifier to its own copy and a resolvable-but-unexported `/compat` subpath is a legitimate host state. Type-only `typeof import("@earendil-works/pi-ai/compat")` is fine and is how `CompleteSimpleFn`/`IsContextOverflowFn` are defined.
- No `pi-coding-agent` dependency: the registry arrives as `unknown` and is probed structurally.

## Consumers
- **`@hs1n/rpiv-advisor`** (`dependencies`): `resolveSideCall`, `stripToolDeclarations` (the latter re-exported by `advisor/context.ts`, which its barrel publishes)
- **`@hs1n/rpiv-btw`** (`dependencies`): `resolveSideCall`, `loadIsContextOverflow`, `stripToolDeclarations`

## Module Structure
```
.                — sidecall.ts (all implementation), index.ts (barrel re-export).
```

## Migration Point
`/compat` is documented as temporary (it goes with Pi's ModelManager migration). When that lands, this module is the single place to change — the two consumers never name a pi-ai entrypoint themselves.

## What Deliberately Does Not Live Here
- **`rpiv-core`'s runtime-slot probe** — it shares only the ~10-line structural bridge; it probes `streamSimple` (not `completeSimple`), returns the runtime object (not a bound callable), and serves child-session option selection rather than a side call. See `docs/adr/0002-rpiv-core-registry-probe-stays-separate.md`.
- **Prompt loading** — each package reads its own `prompts/` asset; a shared loader would have to be handed the caller's `import.meta.url` anchor precisely because it does not own the file.
- **The config, i18n and test-fixture libraries** — separate responsibilities, separate packages.
