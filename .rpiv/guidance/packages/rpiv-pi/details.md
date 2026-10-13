# rpiv-pi — package layout and host counterparts (NOT auto-injected)

Reference material split out of `architecture.md`. Read this when you are changing
the runtime infrastructure under `extensions/rpiv-core/` or the detached-execution
host.

## Package layout

```
rpiv-pi/
├── extensions/rpiv-core/   — Pi runtime extension (TypeScript): session hooks, /rpiv-* commands, sibling registry, guidance + git-context injection, model-management subsystem, built-in `/wf` workflows, detached `/wf` execution (SDK workflow host, lane dock/browser, question lifecycle). The sole TS surface in this package.
│   └── built-ins/          — Compute clusters behind the four built-in workflows (gates, verdicts, checks) — has its own architecture.md
├── agents/                 — Named subagent profile library (Markdown). Read-only specialists dispatched by skills via the Agent tool.
└── skills/                 — User-invocable workflow definitions (Markdown). Each non-underscore subfolder is one skill (SKILL.md + optional support dirs like templates/ or _helpers/); `_shared/` holds cross-skill `.mjs` helper scripts.
```

## Business Context (full)

rpiv-pi augments Pi with a research → design → implement skill pipeline plus the
runtime infrastructure those skills depend on (guidance injection, git-context
injection, bundled-agent sync, session capture, model management, lane
observability). rpiv-core also contributes a model-management subsystem
(`/rpiv-models`, per-skill/preset model + effort overrides, `models.json`). Tool
surfaces live in sibling plugins.

## Failure-Path Resilience (host counterparts)

The detached-execution host modules supply the host-side surfaces the `rpiv-workflow`
failure-resilience ladder consumes:

- **`resetToolTimeout` on the spawned-child host ctx.** Beside the existing `toolTimeout` verdict channel (which reports that a watchdog aborted a runaway bash), `sdk-workflow-host.ts` wires `resetToolTimeout: () => watchdog.reset()`. `BashWatchdog.reset()` clears the watchdog's `fired` flag and pending timers WITHOUT unsubscribing the live `tool_execution_start` listener, so a resumed turn's new bash call re-arms a fresh per-`toolCallId` timer on the same handle — enabling strike-based recovery inside `rpiv-workflow`'s abort-classification ladder without a second child spawn. The watchdog is the same handle armed once per child and disposed in the `finally`.
- **`readSessionBranch` on the workflow-execution host port.** A host-injected reader backed by `SessionManager.open(file).getBranch()`, narrowed to `BranchEntry[]` and wrapped to fail soft (`undefined` on any throw). It lets `rpiv-workflow`'s death-scene artifact writer render a failed stage's last tool calls + final assistant text + session-file path purely from the persisted session JSONL, with no live-session re-query. Absent on programmatic embedders / hosts without the SDK — the writer degrades silently.
