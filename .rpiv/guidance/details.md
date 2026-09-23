# rpiv-mono — layout and package roster (NOT auto-injected)

Reference material split out of `architecture.md` so the auto-injected block carries
the rules that decide whether a change is correct. Read this when you need to know
where something lives or what a package's role is.

## Layout

```
rpiv-mono/
├── packages/
│   ├── rpiv-pi/                  — Umbrella: extension runtime + skills + agents (zero tools)
│   ├── rpiv-<feature>/           — One Pi extension per directory; npm name @juicesharp/rpiv-<feature>
│   ├── rpiv-site/                — DELETED by this fork (was: Astro 5 marketing site)
│   ├── rpiv-telemetry/           — DELETED by this fork (was: private MLflow observability extension)
│   └── test-utils/               — Private workspace package: shared test fixtures (not published)
├── test/                         — Repo-wide Vitest setup (homedir stub + env hygiene + pi-ai//compat mocks + beforeEach singleton resets)
├── scripts/                      — Lockstep release pipeline (release.mjs + sync-versions.js) + repo guards (check-no-decision-codes.mjs, check-slice-overlap.mjs)
│                                 — fork additions: fork-pi-install.sh (local-path Pi install), fork-license-audit.mjs (dependency license inventory), fork-rename-scope.mjs (npm-scope rename), fork-own-skill.mjs (take over a bundled skill into ~/.agents/skills)
├── thoughts/shared/              — Pipeline artifacts: questions/, research/, solutions/, designs/, plans/, reviews/ (gitignored)
├── vitest.config.ts              — Single Vitest runner; `include: ['packages/*/**/*.test.ts']`, setupFiles `['./test/setup.ts']`
├── tsconfig.base.json            — Single shared TS config; no per-package tsconfig.json
├── package.json                  — npm workspaces root
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

Full release pipeline: `.rpiv/guidance/scripts/architecture.md`.
