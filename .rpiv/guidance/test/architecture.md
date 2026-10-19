# test/ — the repo-wide Vitest setup

Injected when you touch this directory, which is exactly when its rules bind: `test/setup.ts`
is where every reset, env rule, and mock lives, and wiring one is the step a new package
forgets. Test *files* live next to their sources under `packages/*` — this file is the
contract they inherit.

## Test Authoring Contract
- **Location**: co-locate `*.test.ts` next to production sources. Vitest's root `include` glob (`packages/*/**/*.test.ts`) discovers them automatically. There is no per-package vitest config.
- **Repo-wide setup** (`test/setup.ts`, runs once per worker before any test file imports):
  - `process.env.HOME` + `USERPROFILE` point to a fresh `mkdtempSync` tmpdir — production modules cache `homedir()` at module-load, so this MUST happen before any package import. One sanctioned exception exists today: setup statically imports `configPath` from `@hs1n/rpiv-config` (ESM-hoisted above the HOME assignment) — safe only because rpiv-config resolves paths lazily; every other production import in setup is dynamic inside `beforeEach`
  - `@earendil-works/pi-ai` is partially mocked via `importOriginal()` (stubs `getSupportedThinkingLevels`; keeps `StringEnum` intact for module-load consumers); `completeSimple` is stubbed on the separate `@earendil-works/pi-ai/compat` mock, because production resolves it through `@hs1n/rpiv-side-call`'s global path, which prefers `/compat`
  - `beforeEach` enforces four reset rules: (1) every package with module-level singleton state exports a reset function and is invoked from `beforeEach`; (2) every `globalThis[Symbol.for(...)]` cache that intentionally survives `vi.resetModules()` is cleared; (3) every config file a package persists under `~/.config/rpiv-<name>/` (or `~/.pi/`) is `rmSync`-ed so filesystem-driven detection starts from a clean state — new code resolves these paths via `@hs1n/rpiv-config`'s XDG-aware `configPath()` (honors `XDG_CONFIG_HOME`, one-way legacy fallback via `loadJsonConfigWithLegacyFallback()`); (4) env hygiene — `PI_CODING_AGENT_DIR`, `XDG_CONFIG_HOME`, and `WEB_SEARCH_PROVIDER` are deleted (at module load AND per test) and the XDG pi agent dir (`~/.config/pi/agent`) is `rmSync`-ed
- **Fixtures**: import factories from `@hs1n/rpiv-test-utils` — see `.rpiv/guidance/packages/test-utils/architecture.md`
- **When adding a package with module-level singleton state**: export a reset (`__resetState` for fresh state, or a named reset like `invalidateSkillIndex`) AND wire it into `test/setup.ts` `beforeEach` in the same change
- **Pre-commit vs pre-push**: tests do NOT run on commit (only Biome + `tsc --noEmit`). Full coverage gates push, with one retry — see the `pre-push` line in `.rpiv/guidance/architecture.md` for why. `git push` runs that gate even when there is nothing to push, so a no-op push costs the same ~90 s
- **Test file size**: the size ratchet counts tests too, at a higher cap (3,000 lines) — split rather than accrete. See `.rpiv/guidance/scripts/details.md` § File-Size Ratchet Guard
