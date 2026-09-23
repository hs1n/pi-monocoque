# rpiv-mono

Monorepo for Pi CLI plugins in the `@juicesharp/rpiv-*` family. Lockstep versions,
single install, single publish pipeline. Targets Pi Agent CLI
(`@earendil-works/pi-coding-agent`), not Claude Code.

> **This checkout is a fork of upstream, not upstream itself.** It is
> `hs1n/pi-monocoque`, forked from `juicesharp/rpiv-mono` (kept as the `upstream`
> remote; `origin` is the fork). Everything below this banner is upstream's framing
> and is accurate about the code; these are the deltas an agent working here must not
> get wrong:
>
> - **Provenance and obligations** — `FORK_NOTICE.md`. MIT requires upstream's
>   copyright notices to stay; `LICENSE` and every `packages/*/LICENSE` are unmodified.
>   The README/roadmap/docs prose is upstream's and states the *upstream* author's
>   views. `rpiv`, `rpiv-pi`, `juicesharp`, `rpiv-pi.com`, and the npm scope
>   `@juicesharp` identify upstream — that scope is not ours.
> - **Installing into Pi — `pi install git:<this repo>` does not work and must not be
>   used.** Pi's git source clones the repo and treats the clone root as the package
>   root, with no subdirectory support, and this monorepo root declares neither a `pi`
>   manifest nor the conventional resource dirs, so a root install loads zero
>   resources. It also fails before that: pi runs `npm install --omit=dev`, and the
>   root's `prepare: husky` needs a devDependency. Install each package by local path
>   with `scripts/fork-pi-install.sh` — see `INSTALL-FORK.md`. Local paths are recorded
>   in Pi settings, not copied, so Pi loads live from this checkout and `/reload` picks
>   up edits without reinstalling.
> - **Never run `/rpiv-setup` in a session that loads this fork.** Its `SIBLINGS`
>   registry installs the *upstream registry* copies, which would load alongside the
>   local ones. `scripts/fork-pi-install.sh` mirrors that registry with local paths.
> - **Nothing here may be published as-is.** Every package is still named
>   `@juicesharp/rpiv-*`. Treat `node scripts/release.mjs` as inoperative: it commits and
>   tags *before* publishing, so a scope mismatch leaves a half-finished release.
> - **Remotes**: `origin` is SSH (`git@github.com:hs1n/pi-monocoque.git`) and needs the
>   key configured in `~/.ssh/config`; `upstream` is HTTPS on purpose (public read-only,
>   no key required).

The layout tree, per-package responsibilities, and the private/opt-in roster are in
`details.md` beside this file — NOT auto-injected. Read it when you need to know
where something lives.

## Layout and build model
- **Build model**: `noEmit: true` everywhere. Packages publish raw `.ts` (Pi loads `.ts` directly via the `pi` manifest). No `dist/`, no per-package tsconfig.json — one shared `tsconfig.base.json` (rpiv-site has its own, excluded from it).
- **Plugin discovery**: each extension package's `package.json` carries a `pi` field — `pi.extensions: ["./index.ts"]` (`["./extension.ts"]` for rpiv-workflow/rpiv-telemetry; `["./extensions"]` for rpiv-pi) and optionally `pi.skills: ["./skills"]`; non-extension packages (rpiv-config, rpiv-site, test-utils) have no `pi` field. Pi loads the default-exported function with an `ExtensionAPI` instance.
- **Sibling registry**: `packages/rpiv-pi/extensions/rpiv-core/siblings.ts` is the single source of truth. Adding an entry here propagates to `/rpiv-setup`, missing-plugin warnings, and presence detection (regex over `~/.pi/agent/settings.json`). A parallel `LEGACY_SIBLINGS` registry drives prune-on-upgrade for superseded packages. **No runtime imports of siblings** — Phase 1 zero-cross-imports contract.
- **Opt-in extensions**: a published sibling becomes opt-in by being **absent from `siblings.ts`** (and from `rpiv-pi/package.json` `peerDependencies`). It still rides lockstep + shared CI infrastructure via the `packages/*` glob, but `/rpiv-setup` won't suggest it — users install it explicitly with `pi install`.
- **Test runner**: Vitest at repo root; one runner with `include: ['packages/*/**/*.test.ts']` discovers every test file; `test/setup.ts` runs once per worker before any test file imports. Coverage excludes `**/index.ts`, `packages/test-utils/**`, `packages/rpiv-site/**`, and `packages/rpiv-telemetry/**`. No per-package vitest configs.

## Commands

| Command | Description |
|---|---|
| `npm install` | One install at root; workspace symlinks under `node_modules/` |
| `npm run check` | Biome (`--write --error-on-warnings`) + `tsc --noEmit -p tsconfig.base.json` |
| `npx tsc --noEmit -p tsconfig.base.json` | **Read-only whole-tree typecheck** (no formatter side effects) — use when a write-scoped probe must not rewrite files outside its own set |
| `npm run check:files -- <paths...>` | Path-scoped Biome (`--write --error-on-warnings`) — rewrites ONLY the paths it is given; **the path-scoped auto-fix lint form** a phase's `#### Automated Verification:` uses to stay write-scoped to its own `files:` set |
| `npm test` / `npm run coverage` | Vitest at root (single runner) / with V8 coverage |
| `npm run build:site` | Build the Astro marketing site (`packages/rpiv-site`) — separate from publish |
| `node scripts/release.mjs <patch\|minor\|major\|x.y.z>` | Cut a lockstep release — see `.rpiv/guidance/scripts/architecture.md` |
| `node scripts/sync-versions.js` | Verify lockstep + rewrite intra-monorepo deps to `^<version>` |
| `bash scripts/fork-pi-install.sh [-l] [--with btw,voice,warp,telemetry]` | **Fork-only.** Install this fork's packages into Pi by local path — the only supported install path here. See `INSTALL-FORK.md` |
| `node scripts/fork-license-audit.mjs .` | **Fork-only.** Dependency license inventory + copyleft/unknown flagging (Node built-ins only, no npx) |
| `node scripts/fork-rename-scope.mjs <@scope>` | **Fork-only.** Rewrite the npm scope across the repo (idempotent, `--report` / `--dry-run`) |
| `node scripts/fork-own-skill.mjs <skill> [--list] [--check] [--remove <skill>]` | **Fork-only.** Copy a bundled skill into `~/.agents/skills` so it shadows the package one, carrying its `_shared/` deps |

Husky hooks (local-only):
- `pre-commit` — runs `npm run check:decision-codes` (fail-fast contamination guard) then `npm run check` (format + typecheck); restages files biome may have rewritten
- `pre-push` — runs `npm run coverage` (full test + coverage thresholds gate)

## Conventions

- **Lockstep versions**: every `packages/*/package.json` shares one `version`. Enforced by `sync-versions.js` (exit 1 on drift). `"private": true` packages bump too but are skipped at publish. **Naming**: directory `rpiv-<feature>` ↔ npm `@juicesharp/rpiv-<feature>`.
- **Sibling deps as `peerDependencies: "*"`** — `rpiv-pi` peer-pins every registered sibling and `pi-*` runtime; bundlers never include them.
- **`files` arrays** explicitly list `.ts` source + asset directories (e.g., `prompts/`); `.rpiv/` is never shipped; directory entries need a `!**/*.test.ts` negation (as in rpiv-pi/rpiv-web-tools/rpiv-workflow/rpiv-advisor) to keep co-located tests out of the tarball; dev-only fixture trees are excluded the same way (rpiv-pi's `built-ins/__fixtures__/`).
- **`type: "module"` everywhere** with Node16 resolution; relative imports use `.js` extensions from `.ts` source. Test files co-locate as `*.test.ts` next to production sources.
- **No decision-code citations in committed `.ts`** — comments state the contract in place, never cite parenthesized plan/phase codes; enforced by `scripts/check-no-decision-codes.mjs` (`npm run check:decision-codes`, the first pre-commit stage).

<important if="you are cutting or planning a release">
## Releasing
- Publishing is local-only — CI (`.github/workflows/ci.yml`) runs check + coverage but never publishes npm packages (the marketing site deploys separately via `deploy-site.yml`). Use `node scripts/release.mjs` from monorepo root — never `npm version` inside a package.
- Lockstep means every workspace package gets the same new version. `"private": true` blocks publish but not version bumping. Detailed pipeline: see `.rpiv/guidance/scripts/architecture.md`
</important>

<important if="you are adding a new sibling Pi extension package">
## Adding a Sibling Package (cross-layer checklist)
1. Create `packages/rpiv-<name>/` with `package.json` matching the lockstep version, `pi.extensions: ["./index.ts"]`, and the relevant `peerDependencies` (`pi-coding-agent`, `pi-tui`/`pi-ai` as needed)
2. Populate the `files` array with all shipped `.ts` source + any asset directory (e.g. `prompts/`, `locales/`)
3. Add the sibling to `siblings.ts` — see `.rpiv/guidance/packages/rpiv-pi/extensions/rpiv-core/architecture.md`
4. Pin in `packages/rpiv-pi/package.json` `peerDependencies` as `"*"`
5. Author `.rpiv/guidance/packages/rpiv-<name>/architecture.md` for the new layer
6. Add `"test": "vitest run"` to the package `scripts` (Vitest's root `include` glob picks the new file up automatically — no per-package config)
7. Run `node scripts/sync-versions.js` to wire intra-monorepo deps (or run any `npm run version:*` script, which delegates to it)
8. Add a `CHANGELOG.md` containing `## [Unreleased]` so `release.mjs` picks it up
9. If the package owns module-level singleton state, export a reset function and wire it into `test/setup.ts` `beforeEach` (also clear any `globalThis[Symbol.for(...)]` cache the package owns)
10. If the package consumes UI strings, declare `@juicesharp/rpiv-i18n` in `peerDependencies` + `peerDependenciesMeta.optional: true` and call `registerStrings(<pkg-name>, byLocale)` at extension load — see `.rpiv/guidance/packages/rpiv-i18n/architecture.md`
</important>

<important if="you are writing or modifying tests in any package">
## Test Authoring Contract
- **Location**: co-locate `*.test.ts` next to production sources. Vitest's root `include` glob (`packages/*/**/*.test.ts`) discovers them automatically.
- **Repo-wide setup** (`test/setup.ts`, runs once per worker before any test file imports):
  - `process.env.HOME` + `USERPROFILE` point to a fresh `mkdtempSync` tmpdir — production modules cache `homedir()` at module-load, so this MUST happen before any package import. One sanctioned exception exists today: setup statically imports `configPath` from `@juicesharp/rpiv-config` (ESM-hoisted above the HOME assignment) — safe only because rpiv-config resolves paths lazily; every other production import in setup is dynamic inside `beforeEach`
  - `@earendil-works/pi-ai` is partially mocked via `importOriginal()` (stubs `getSupportedThinkingLevels`; keeps `StringEnum` intact for module-load consumers); `completeSimple` is stubbed on the separate `@earendil-works/pi-ai/compat` mock, because production resolves it through the `loadCompleteSimple()` shim that prefers `/compat`.
  - `beforeEach` enforces four reset rules: (1) every package with module-level singleton state exports a reset function and is invoked from `beforeEach`; (2) every `globalThis[Symbol.for(...)]` cache that intentionally survives `vi.resetModules()` is cleared; (3) every config file a package persists under `~/.config/rpiv-<name>/` (or `~/.pi/`) is `rmSync`-ed so filesystem-driven detection starts from a clean state — new code resolves these paths via `@juicesharp/rpiv-config`'s XDG-aware `configPath()` (honors `XDG_CONFIG_HOME`, one-way legacy fallback via `loadJsonConfigWithLegacyFallback()`); (4) env hygiene — `PI_CODING_AGENT_DIR`, `XDG_CONFIG_HOME`, and `WEB_SEARCH_PROVIDER` are deleted (at module load AND per test) and the XDG pi agent dir (`~/.config/pi/agent`) is `rmSync`-ed.
- **Fixtures**: import factories from `@juicesharp/rpiv-test-utils` — see `.rpiv/guidance/packages/test-utils/architecture.md`.
- **When adding a package with module-level singleton state**: export a reset (`__resetState` for fresh state, or named reset like `invalidateSkillIndex`) AND wire it into `test/setup.ts` `beforeEach` in the same change.
- **Pre-commit vs pre-push**: tests do NOT run on commit (only Biome + `tsc --noEmit`). Full coverage gates push.
</important>

<important if="you are touching tool registration, schemas, or session hooks anywhere in the monorepo">
## Cross-Package Pi Conventions
- Tool params via the standalone `typebox` package (`import { Type } from "typebox"`) `Type.Object({...})`; the `description` field doubles as LLM-facing prompt copy. (Two `rpiv-workflow` test files still import `@sinclair/typebox`.)
- Tool result envelope: `{ content: [{ type: "text", text }], details: <typed object> }` — `details` is the persisted replay snapshot: replay handlers walking the session branch (e.g. rpiv-todo's `replayFromBranch()`, wired to `session_start` / `session_compact` / `session_tree`) rebuild module state from it after compaction or `/reload`.
- pi >= 0.80 hosts export `completeSimple` from pi-ai's `/compat` entrypoint (pre-0.80 hosts: package root, no `/compat`); consumers (`rpiv-advisor`, `rpiv-btw`) call it through a per-package `pi-compat.ts` `loadCompleteSimple()` shim — tries `/compat` first, falls back to the root entrypoint only on module-resolution failures. Newer hosts additionally expose an auth-aware `ModelRuntime.completeSimple` facade off `ctx.modelRegistry` — consumers prefer the facade and pass only `{ signal }` (never explicit `apiKey`/`headers`, which would bypass credential-derived baseUrl).
- System prompts loaded once at module init via `readFileSync(fileURLToPath(new URL("./prompts/X.txt", import.meta.url))).trimEnd()` — ESM-safe, cache-stable.
- Sibling-owned widget pattern: `setWidget(KEY, factory, { placement: "aboveEditor" })` register-once + `tui.requestRender()` on update — see `.rpiv/guidance/packages/rpiv-todo/architecture.md`.
- For tool-specific patterns, consult the relevant package's `.rpiv/guidance/packages/<pkg>/architecture.md`.
</important>
