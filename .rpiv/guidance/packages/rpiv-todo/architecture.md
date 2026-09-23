# rpiv-todo

Sibling Pi extension in `rpiv-mono`. Lockstep version with the rest of the
`@hs1n/rpiv-*` family — never bump independently. Claude-Code-parity task management
for Pi. Registers a single multiplexed `todo` tool (action-discriminated:
create/update/list/get/delete/clear), the `/todos` slash command, a persistent
overlay widget mounted above the editor, and a global collapse/expand shortcut for it
(`pi.registerShortcut`, default `ctrl+shift+t`; `collapseKey: "off"` skips
registration entirely). **State is reconstructed by replaying the session branch — no
disk persistence.**

The module map, the dependency list, and the reducer/store/replay + widget-mount code
are in `details.md` beside this file — NOT auto-injected. Read it when you are
changing state handling or the overlay's lifecycle wiring.

## Overlay Data Flow (rules)
- **Overflow layout is a selector** — `selectOverlayLayout(state, budget)` drops completed tasks first, then truncates the non-completed tail, reserving one summary row inside the budget (`state/selectors.ts`)
- **Completed-task hiding is a display state machine** — `completedTaskIdsPendingHide`/`hiddenCompletedTaskIds` snapshot per `agent_start` (`hideCompletedTasksFromPreviousTurn`), so completed rows vanish on the next turn rather than mid-turn
- **`renderCall` reads the foreground slot** — `ToolRenderContext` carries no session id, so render hooks render `getRenderState()`; child-session calls degrade to a `#id` suffix
- **Trailing spacer row** — the rendered widget is one line taller than `maxWidgetLines` by design (`withTrailingSpacer`)
- **Widget mount is lazy, idempotent, sid-gated** — the FIRST `hasUI` `session_start` claims the foreground render pointer; a child (distinct sid) is gated out of rebinding/disposing it. The overlay module loads through a memoized loader that clears rejected promises, latches poisoned-namespace errors (`isStaleOverlayModuleError` → `STALE_OVERLAY_MESSAGE` remedy), and pre-warms after a short delay; a `lifecycleGeneration` counter invalidates stale loads across `/reload`. Registration is a register-once `setWidget` factory whose `invalidate()` is a no-op (no cached strings) — later updates just `tui.requestRender()`

## Architectural Boundaries
- **Status transitions are a single declarative table** — `Record<TaskStatus, ReadonlySet<TaskStatus>>` in `state/invariants.ts`, never an `if/switch` ladder; adding a status is a one-line edit and mistakes surface as data
- **NO replay from `tool_execution_end`** — `message_end` runs after, so the branch is stale; the widget reads live state via `getRenderState()` (the ctx-less foreground slot — `import { getRenderState } from "./state/store.js"`) instead
- **`TOOL_NAME` and `WIDGET_KEY` are preserved verbatim** — renaming breaks session-history replay and persisted UI state
- **Delete is a tombstone** (`status: "deleted"`, terminal) — preserves ids so historic `blockedBy` references still resolve
- **NO disk persistence** — state derives entirely from the session branch via the `details` envelope
- **Mutation goes through `store.ts`** — reducer is pure; only `commitState` / `replaceState` / `evictSession` / `__resetState` write the session-slot Map (all keyed by sid); `setActiveRenderSession` / `clearActiveRenderSession` move the foreground pointer (a distinct concept, not a task-state writer)
- **`session_compact`/`session_tree` share one extracted `replayAndRefresh` handler** (`index.ts`) — swallows ONLY the known stale-ctx error (`isStaleCtxError`: auto-compaction races session disposal); other errors are real replay bugs and propagate; the overlay refresh is sid-gated to the foreground
- **Overlay teardown is try/finally** — `session_shutdown` always evicts the slot; the foreground's own shutdown (or an unknown/stale sid `""`, treated as foreground) then runs `todoOverlay?.dispose()` with `todoOverlay = undefined` + `clearActiveRenderSession()` in `finally` — `dispose()` can throw on a stale ui proxy, and a surviving pointer would target the already-evicted slot (overlay silently renders empty)

<important if="you are adding a new todo action">
## Adding an Action
1. Add the literal to the `TaskAction` union (`tool/types.ts`) and to the action `StringEnum` in the tool params schema (`tool/`)
2. Add the reducer branch in `state/state-reducer.ts` — extend the `Op` union and return `errorResult` on failures (errors are values, never throws)
3. Extend the response-envelope's `formatContent` switch (`tool/response-envelope.ts`) — compiler-enforced exhaustive over `Op`; it owns content/details formatting
4. Hook renderers (action glyph, status glyph, status color) in the view layer; if status-changing, extend the `VALID_TRANSITIONS` table in `state/invariants.ts` + the overlay's status-glyph and line formatter
5. Update the `/todos` command if a new section is needed
6. Add a prompt-guideline bullet so the agent knows *when* to call it
</important>

<important if="you are customizing the overlay">
## Customizing the Overlay
- **Placement**: change `{ placement: "aboveEditor" }` to `"belowEditor"` in `setWidget`
- **Line cap**: config field `maxWidgetLines` (default 12, floor of 3), read fresh via `getMaxWidgetLines()` at render time — no `/reload`; overflow math adapts automatically (see `selectOverlayLayout`). Exception: when Pi's tool-output expansion mode is on (`uiCtx.getToolsExpanded?.() === true`, optional-chained for hosts predating it), the render bypasses the cap and budgets all visible tasks so Pi's expand shortcut also expands this widget
- **Collapse key**: config field `collapseKey` (default `ctrl+shift+t`, `"off"` disables) — validated strictly against pi-tui's KeyId grammar (config.ts's `isValidCollapseKeySpec`) so a typo cannot silently consume bare keypresses; resolved once at factory scope, so a change needs `/reload` to re-bind; `toggleCollapse()` forces `requestRender(true)` on the height step, and the collapsed view renders a dim expand hint (static label when the key is `"off"` mid-session)
- **Glyphs / heading**: the status-glyph palette is the only glyph coupling site; the heading-color/icon/text triple lives in `renderWidget`
- Theme always via `theme.fg(...)` — never raw ANSI; use `truncateToWidth` for every line
</important>
