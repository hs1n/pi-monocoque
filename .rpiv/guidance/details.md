# pi-monocoque — layout and package roster (NOT auto-injected)

Reference material split out of `architecture.md` so the auto-injected block carries
the rules that decide whether a change is correct. Read this when you need to know
where something lives or what a package's role is.

## Layout

```
pi-monocoque/
├── packages/
│   ├── rpiv-pi/                  — Umbrella: extension runtime + skills + agents (zero tools)
│   ├── rpiv-<feature>/           — One Pi extension per directory; npm name @hs1n/rpiv-<feature> (module identity, not a registry entry — nothing is published)
│   └── test-utils/               — Private workspace package: shared test fixtures (never installed into Pi)
├── test/                         — Repo-wide Vitest setup (homedir stub + env hygiene + pi-ai//compat mocks + beforeEach singleton resets)
├── scripts/                      — Repo guards (check-no-decision-codes.mjs, check-file-sizes.mjs, check-host-provided-deps.mjs, check-slice-overlap.mjs, check-unused-deps.mjs) + sync-versions.js (lockstep writer: root version → all 12)
│                                 — fork additions: fork-pi-install.sh (local-path Pi install), fork-license-audit.mjs (dependency license inventory), fork-rename-scope.mjs (scope rename), fork-own-skill.mjs (take over a bundled skill into ~/.agents/skills)
├── .rpiv/guidance/               — Committed guidance shadow tree (see "Guidance" above); the only tracked dir under `.rpiv/`
├── .rpiv/artifacts/ + workflows/ — Gitignored pipeline artifacts (plans/, reviews/, goal/, failures/) and `/wf` run state
├── vitest.config.ts              — Single Vitest runner; `include: ['packages/*/**/*.test.ts']`, setupFiles `['./test/setup.ts']`
├── tsconfig.base.json            — Single shared TS config; no per-package tsconfig.json
├── package.json                  — npm workspaces root + the root `pi` manifest (8 extensions + rpiv-pi/skills) that makes `pi install git:<repo>` work
└── biome.json                    — Single shared lint/format config
```

## Sibling registry mechanics

The registry is architectural, not just family bookkeeping: it covers registered
extensions generally — including pinned third-party runtime deps the family needs
installed (the `@tintinweb/pi-subagents` Agent dispatcher, registered with a
fork-detection regex; its unscoped legacy name rides `LEGACY_SIBLINGS` and is pruned
on upgrade).

## Opt-in and private roster (today)

This fork deleted four packages — `rpiv-site`, `rpiv-telemetry`, `rpiv-voice`, `rpiv-warp`. See `FORK_NOTICE.md`. The surviving opt-in sibling is `rpiv-btw` (absent from `siblings.ts` + `rpiv-pi/package.json` `peerDependencies`). The surviving private package is `test-utils` (`"private": true` — skips publish, otherwise follows the same lockstep rules).

## Adding a sibling package (checklist)

Every step is a place a new package silently fails to participate. The root-manifest step is
covered by `root-pi-manifest.test.ts`, so forgetting it fails the build rather than the next
install.

1. Create `packages/rpiv-<name>/` with `package.json` carrying the root version, `pi.extensions: ["./index.ts"]`, and the relevant `peerDependencies` (`pi-coding-agent`, `pi-tui`/`pi-ai` as needed; `"typebox": "*"` whenever the source imports `typebox` — host-provided packages are always peer-pinned `"*"`, never `dependencies`; and only the specifiers the host aliases: `typebox`, `typebox/value`, `typebox/compile`)
2. Populate the `files` array with all shipped `.ts` source + any asset directory (`prompts/`, `locales/`), plus `!**/*.test.ts` on directory entries
3. Add the sibling to `siblings.ts` — see `.rpiv/guidance/packages/rpiv-pi/extensions/rpiv-core/architecture.md`
4. Pin it in `packages/rpiv-pi/package.json` `peerDependencies` as `"*"`
5. Author `.rpiv/guidance/packages/rpiv-<name>/architecture.md` for the new layer
6. Add `"test": "vitest run"` to the package `scripts` (the root `include` glob picks the file up; no per-package config)
7. Run `npm run versions:sync` — it stamps the root version onto the new manifest and rewires intra-monorepo deps
8. Add a `CHANGELOG.md` containing `## [Unreleased]`
9. Add the package's extension entry to the root `package.json` `pi.extensions`, or a git/root install will not load it
10. If the package owns module-level singleton state, export a reset and wire it into `test/setup.ts` `beforeEach` — and clear any `globalThis[Symbol.for(...)]` cache it owns (see `.rpiv/guidance/test/architecture.md`)
11. If the package consumes UI strings, declare `@hs1n/rpiv-i18n` in `peerDependencies` + `peerDependenciesMeta.optional: true` and call `registerStrings(<pkg-name>, byLocale)` at extension load

## Command rationale

- **`npx tsc --noEmit -p tsconfig.base.json`** is the read-only whole-tree typecheck
  the check write-scoped probes (elaborate/implement lanes) run when they must not
  rewrite files outside their own set.
- **`npm run check:files -- <paths...>`** is the path-scoped auto-fix lint form a
  phase's `#### Automated Verification:` uses to stay write-scoped to its own
  `files:` set.
- **`node scripts/fork-own-skill.mjs`** — a project-level `.agents/skills` target
  warns: it is harvested only because of this fork's `agentsSkillDirs` fix in
  `skill-contracts-source.ts`, and Pi gates dispatching from it on project trust.

Full guard/versioning reference: `.rpiv/guidance/scripts/architecture.md` (rules, command
table) and `.rpiv/guidance/scripts/details.md` (per-guard mechanics). Test contract:
`.rpiv/guidance/test/architecture.md`.
