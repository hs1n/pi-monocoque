# rpiv-todo — modules, state split and widget mount (NOT auto-injected)

Reference material split out of `architecture.md`. Read this when you are changing
state handling or the overlay's lifecycle wiring.

## Dependencies

- **`@earendil-works/pi-coding-agent`** (peer): `ExtensionAPI`, `ExtensionUIContext`, theme/render primitives
- **`@earendil-works/pi-ai`** (peer): `StringEnum` for action/status enums
- **`@earendil-works/pi-tui`** (peer): width-safe text helpers, render primitives
- **`@hs1n/rpiv-i18n`** (peer, `"*"`, optional): locale lookups via `state/i18n-bridge.ts`
- **`@hs1n/rpiv-config`** (dependency): `loadJsonConfigWithLegacyFallback`/`validateGuidanceFields` — XDG-path load with one-way legacy fallback; `config.ts` owns `TodoConfig` (prompt overrides + overlay settings `maxWidgetLines`/`collapseKey`, `config.ts:4-15`) and the collapse-key grammar validator
- **`typebox`** (dependency — moved from peers so installers that don't materialise peer deps still resolve it): tool parameter schema

## Consumers

- **Pi extension host** (loads via `pi.extensions: ["./index.ts"]`) and **`rpiv-pi`** (lists in `peerDependencies` and `siblings.ts`)

## Module Structure

```
.                — Composer (index.ts) + tool/command registrars (todo.ts) + overlay widget class
                   (todo-overlay.ts) + config.ts. Each capability gets a single file at the package
                   root; the composer is pure wiring; todo.ts re-exports the reducer/store/graph/types
                   surface so existing consumers keep importing from "./todo.js".
state/           — Reducer + store cell + replay (compaction-survival) + task-graph + invariants
                   + selectors + i18n-bridge. No Pi imports below the bridge — testable in isolation.
                   Detailed shape: `.rpiv/guidance/packages/rpiv-todo/state/architecture.md`.
tool/            — Pi tool surface: TypeBox params, response-envelope shape consumed by replay,
                   terminal-text sanitizer (sanitize.ts, shared with view/).
                   Detailed: `.rpiv/guidance/packages/rpiv-todo/tool/architecture.md`
view/            — Presentation layer: format.ts (line formatting + render hooks renderTodoCall/
                   renderTodoResult + the glyph/color tables) shared by /todos command + overlay.
locales/         — JSON maps registered by index.ts (registerLocalesFromDir); i18n-bridge resolves lookups.
```

## Reducer / Store / Replay Split

```typescript
// state/state.ts — canonical shape, single source of truth.
export interface TaskState { tasks: Task[]; nextId: number; }

// state/state-reducer.ts — pure: (state, action, params) → { state, op }.
// `op` is a closed tagged union (create | update | list | get | delete | clear | error).
// `update` merges metadata keys; a null value deletes the key; an empty record drops metadata.
export function applyTaskMutation(state, action, params): ApplyResult { /* ... */ }

// state/store.ts — per-session slots (Map<sid, TaskState>) + a ctx-less render pointer.
// Every accessor/seam is keyed by session id so a detached/child session (distinct sid)
// can never read or clobber another session's tasks.
export function sid(ctx): string;                // sessionManager.getSessionId() ?? ""
export function getState(sessionId), getTodos(sessionId), getNextId(sessionId);   // read-only accessors
// The four slot writers (commitState post-reducer / replaceState replay seam / evictSession /
// __resetState) — see Architectural Boundaries.
// Foreground render pointer — which slot the ctx-less readers (overlay, renderCall) show:
// getRenderState() = slotFor(activeRenderSession); setActiveRenderSession(id) claimed once by
// first UI start; getActiveRenderSession() read by the index.ts sid-gate; clearActiveRenderSession() on teardown.

// state/replay.ts — pure: walk branch, return fresh TaskState (last-writer-wins).
export function replayFromBranch(ctx): TaskState;
```

## Persistent Widget Mount

```typescript
// Lazy: the FIRST hasUI session_start claims the foreground render pointer (creator-ownership); a child
// (distinct sid) is sid-gated out of rebinding/disposing it. The overlay module itself loads through a
// memoized loader (makeTodoOverlayLoader) that clears rejected promises, latches poisoned-namespace
// errors (isStaleOverlayModuleError → STALE_OVERLAY_MESSAGE remedy), and pre-warms after a short delay;
// a lifecycleGeneration counter invalidates stale loads across /reload.
pi.on("session_start", async (_e, ctx) => {
    const id = sid(ctx); replaceState(id, replayFromBranch(ctx));   // each session → its OWN slot
    if (!ctx.hasUI) return;
    if (getActiveRenderSession() === "") setActiveRenderSession(id);   // no eager ctor
    if (id !== getActiveRenderSession()) return;   // child: skip rebind
    uiCtx = ctx.ui; await updateTodoOverlay(true);   // lazy import + task-gated ctor inside
});

// Register-once factory: setWidget(WIDGET_KEY, (tui, theme) => ({ render, invalidate }),
// { placement: "aboveEditor" }) — the factory captures `tui`; invalidate() is a
// no-op (no cached strings); setUICtx change re-registers; later updates just tui.requestRender().
```
