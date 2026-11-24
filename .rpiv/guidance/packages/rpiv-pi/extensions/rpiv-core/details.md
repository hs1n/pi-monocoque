# rpiv-core Extension — module map and internals (NOT auto-injected)

Reference material split out of `architecture.md` so the auto-injected block carries
only what decides whether a change is correct. Read this when you need to pick the
right module, trace a dependency edge, or work on the host plumbing.

## Monorepo Context

Lives inside `packages/rpiv-pi/`; sibling tool source is at `../../../rpiv-<name>/`.
This extension never statically value-imports a sibling from the entry graph —
`siblings.ts` regex-detects them in `~/.pi/agent/settings.json` OR in the source paths
of what is loaded (#216). Adding a sibling
needs a `siblings.ts` entry plus a `peerDependencies` line pinned to `"*"` in
`rpiv-pi/package.json`. Versions are lockstep from the monorepo root's `package.json`
(`npm run versions:sync` propagates the one number); nothing is published.

## Module Structure

Each capability is a source module + co-located `<feature>.test.ts`.

| module | owns |
|---|---|
| `index.ts` | Composer — no inline handlers; encodes one ordering invariant: session-capture before skill-bracket |
| `session-hooks.ts` | Lifecycle wiring + the `guidance.ts` / `git-context.ts` / `agents.ts` / `pipeline-pointer.ts` / `skill-shadow.ts` engines. Compaction only marks the exact SessionManager and defers one merged context block to its next `before_agent_start` — never `sendMessage` inside `session_compact` |
| `session-capture.ts` | `session_start` capture of modelRegistry/uiContext/model, read by the `/skill:` bracket |
| `skill-bracket.ts` | The standalone `/skill:` model + effort override bracket (`input` + `agent_end`) |
| `models-config.ts` / `models-config-validate.ts` / `models-config-sources.ts` | `models.json` schema + cascade, the warn-on-miss typo check, and the key universes both read (bundled agent names, registered skill names) |
| `models-picker.ts` + `rpiv-models/` | The `/rpiv-models` cascade picker: `command.ts`, `index.ts`, `items.ts`, `overrides.ts` (+ unit tests) |
| `agents*.ts` | Bundled-agent manifest, sync, frontmatter injection, allowlist. `agent-enablement.ts` is the pure sibling-tool enablement map driving conditional frontmatter injection (currently empty) |
| `guidance.ts` / `git-context.ts` / `pipeline-pointer.ts` / `skill-shadow.ts` | Session-start and per-tool-call context injection; each is a pure resolver plus wiring in `session-hooks.ts` |
| `*-command.ts` | Registrars: `setup-command`, `update-agents-command` |
| `*.ts` (utilities) | Primitive helpers: siblings, package-checks, loaded-siblings, paths, pi-installer, prune-legacy-siblings, banner, constants, frontmatter, utils |

## Dependencies

- **`@earendil-works/pi-coding-agent`**: `ExtensionAPI`, event-type guards. **`@earendil-works/pi-tui`**: static in `models-picker.ts` and type-only in `rpiv-models/`. **`@earendil-works/pi-ai`** (peer): `Model` types + value imports (`getSupportedThinkingLevels` in `rpiv-models/items.ts`).
- **`@hs1n/rpiv-config`** (dependency): static value imports — `configPath` + `loadJsonConfigWithLegacyFallback` + `validateConfig` in `models-config.ts`; `parseModelKey` in `session-capture.ts`; `loadJsonConfigWithLegacyFallback` + `modelKey` + `saveJsonConfig` in `rpiv-models/`.
- **`typebox`** (`peerDependencies: "*"`, host-provided): `Type`/`Static` schema for `models.json` in `models-config.ts`. Pi supplies and aliases it at load time; never a `dependencies` entry (v2.12.0, #282).
- Node built-ins: `node:fs`, `node:path`, `node:url`, `node:os`, `node:child_process`.
- External processes: `git` (via `pi.exec`), `pi` CLI (via `spawn` for the installer).

Sibling *presence detection* is settings ∪ loaded: `package-checks.ts` unions the
settings regex with a runtime snapshot (`loaded-siblings.ts`
`readLoadedSiblingSources(pi)` — `sourceInfo.path` of every tool and
`source: "extension"` command, plus `marker` slots on `globalThis` for siblings with
neither, today only rpiv-args) taken ONCE per pass (session_start maintenance,
`/rpiv-setup`, `/rpiv-update-agents`) and threaded into the banner, the installer and
both agents-sync gates. Omitting the snapshot is exactly the settings-only rule, so
the union can only find MORE siblings (kits, `pi install -l`, `pi -e` — #216).
`sibling-import-graph.test.ts` enforces that no file statically reachable from
`index.ts` value-imports a sibling.

## Consumers

- **Pi extension host**: loads via `package.json` `"pi": { "extensions": ["./extensions"] }`; calls `default export(pi: ExtensionAPI)` at session start. Registration stays idempotent, so a second load in one process or a `/reload` re-registers cleanly.

## Sibling registry mechanics

The registry covers registered extensions generally, not just family bookkeeping: it
also carries pinned third-party runtime deps the family needs installed — the
`@tintinweb/pi-subagents` Agent dispatcher, registered with a fork-detection regex,
whose unscoped legacy name rides `LEGACY_SIBLINGS` and is pruned on upgrade. A
parallel `LEGACY_SIBLINGS` registry drives prune-on-upgrade for superseded packages.

## No run state

The extension holds nothing across a turn except per-session identity:
`session-capture.ts` records the model surface the `/skill:` bracket needs, and the
injection engines keep their dedup sets. Multi-stage work is orchestrated by the
agent with Pi's own `Agent` and `SubagentWorkflow` tools, so this package spawns no
child session, owns no executor provider, and writes no run journal.
