# rpiv-pi — package layout and host counterparts (NOT auto-injected)

Reference material split out of `architecture.md`. Read this when you are changing
the runtime infrastructure under `extensions/rpiv-core/`.

## Package layout

```
rpiv-pi/
├── extensions/rpiv-core/   — Pi runtime extension (TypeScript): session hooks, /rpiv-* commands, sibling registry, guidance + git-context injection, model-management subsystem. The sole TS surface in this package.
├── agents/                 — Named subagent profile library (Markdown). Read-only specialists dispatched by skills via the Agent tool.
└── skills/                 — User-invocable skill definitions (Markdown). Each non-underscore subfolder is one skill (SKILL.md + optional support dirs like templates/ or _helpers/); `_shared/` holds cross-skill `.mjs` helper scripts.
```

## Business Context (full)

rpiv-pi augments Pi with a research → design → implement skill pipeline plus the
runtime infrastructure those skills depend on (guidance injection, git-context
injection, bundled-agent sync, session capture, model management). rpiv-core also
contributes the model-management subsystem (`/rpiv-models`, per-skill model +
effort overrides, `models.json`). Tool surfaces live in sibling plugins.
