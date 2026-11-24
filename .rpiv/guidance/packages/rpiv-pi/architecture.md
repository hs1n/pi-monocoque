# rpiv-pi

Pi CLI plugin package: extends the Pi coding agent with TypeScript runtime
infrastructure, slash commands, and Markdown-based skill definitions. Umbrella
package in `pi-monocoque` — lockstep version with the rest of the `@hs1n/rpiv-*`
family, sourced from the monorepo root's `package.json` (`npm run versions:sync`
propagates it), **never `npm version` here individually**, and nothing is published.

Sibling source lives at `../<name>/` and their tools are wired in via
`extensions/rpiv-core/siblings.ts` (regex-based filesystem detection — **no runtime
imports**). Pi discovers extensions via `pi.extensions` and skills via `pi.skills` in
`package.json`. **rpiv-pi registers zero tools** — every tool surface lives in a
sibling plugin; install missing siblings via `/rpiv-setup`.

The package layout tree, the command inventory, and the host-counterpart mechanics
are in `details.md` beside this file — NOT auto-injected. Read it when you are
changing the runtime infrastructure under `extensions/rpiv-core/`.

## Commands

| Command | Description |
|---|---|
| `pi` | Start a Pi session with rpiv-pi loaded |
| `/skill:<name>` | Invoke a skill (e.g. `/skill:commit`, `/skill:discover`) |
| `/rpiv-update-agents` | Sync bundled agents into `~/.pi/agent/agents/`; clean up legacy per-cwd agent dirs |
| `/rpiv-setup` | Install missing sibling plugins (local paths from this checkout; npm for third-party entries); prune `LEGACY_SIBLINGS` from `~/.pi/agent/settings.json` |
| `/rpiv-models` | Model/effort cascade picker — set per-skill overrides written to `models.json` |

Sibling-plugin commands are registered by the siblings themselves once installed.

## Business Context (rules)
rpiv-pi augments Pi with a research → design → implement skill pipeline plus the
runtime infrastructure those skills depend on (guidance injection, git-context
injection, bundled-agent sync, session capture, model management).

- **No run state and no child sessions**: skills are prompt bodies plus a few Node `.mjs` helpers. Nothing here spawns a Pi session. Multi-stage work is orchestrated by the agent with Pi's own `Agent` and `SubagentWorkflow` tools, so a stage carries no recorded position and no resume point

<important if="you are adding a new end-to-end feature (skill + agent)">
## Adding a Feature End-to-End
1. Skill body → see `.rpiv/guidance/packages/rpiv-pi/skills/architecture.md`
2. Named subagent (if the skill needs a new specialist) → see `.rpiv/guidance/packages/rpiv-pi/agents/architecture.md`
3. Runtime infrastructure (session hooks, commands) → see `.rpiv/guidance/packages/rpiv-pi/extensions/rpiv-core/architecture.md`

New tools belong in sibling plugins, not here — `rpiv-pi` is pure infrastructure.
</important>

<important if="you are modifying guidance injection behavior">
## Guidance Injection Contract
Single delivery path inside `extensions/rpiv-core/`. On `tool_call` for read/edit/write, `resolveGuidance` resolves per-depth at most one of `AGENTS.md > CLAUDE.md > .rpiv/guidance/<sub>/architecture.md` (depth 0 skips AGENTS/CLAUDE — Pi's own resource-loader handles `<cwd>` already), and the tool path injects only its DEEPEST not-yet-injected hit (`TOOL_PATH_GUIDANCE_LIMIT`, applied AFTER the dedup filter — so `null` means "everything resolved is already injected" exactly once, and an intermediate level arrives on a later touch of that directory rather than being dropped): the root file is already delivered at `session_start` and re-delivered by the post-compaction block. Each new file injected via `pi.sendMessage` with `display: !!pi.getFlag(FLAG_DEBUG)` (hidden unless the `rpiv-debug` flag is set); an in-process `Set` dedups across the session; cleared on `session_start`/`session_compact`/`session_shutdown`. The `session_start` injections are keyed by SessionManager identity so a repeat fire for one session does not re-send the root file verbatim (Pi holds one sessionManager per session for its lifetime), while a compacted session and every fresh identity still inject. **Never call `pi.sendMessage` from `session_compact`**: it queues control messages into overflow recovery. Mark the compacted SessionManager by identity and return one merged root-guidance + pipeline-pointer + forced-fresh Git-context message from that session's next `before_agent_start` instead; bypass process-global dedup for that marked restoration so another concurrent session cannot suppress its components. **Resolve every candidate through `hasExactFile(dir, name)`, never `existsSync(join(dir, name))`.** APFS and NTFS are case-insensitive by default, so the latter is satisfied by any case-variant of the name: `AGENTS.md` matched `packages/rpiv-pi/docs/agents.md` — a docs page this repo has since renamed to `bundled-agents.md` — and injected ~5 KB of unrelated docs under a guidance label. First-match-wins made the louder failure the rarer one — an unrelated case-colliding file also shadows a real `.rpiv/guidance/<sub>/architecture.md` at the same depth. A new candidate added to the ladder without the helper reintroduces both.
</important>

<important if="you are sunsetting an old sibling and replacing it with a new one">
## Deprecating a Sibling
1. Add the deprecated package's regex to `LEGACY_SIBLINGS` in `siblings.ts` with a one-line `reason`
2. The next `/rpiv-setup` invocation prunes the entry from `~/.pi/agent/settings.json` (only `matches` is consumed — the notify message lists the raw pruned `packages[]` entries)
3. Delete the deprecated entry from `SIBLINGS` and the `peerDependencies` block in `package.json`
4. Add a CHANGELOG note under `[Unreleased]` flagging the deprecation
</important>
