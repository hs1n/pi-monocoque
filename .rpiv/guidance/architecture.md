# pi-monocoque

Monorepo for the `@hs1n/rpiv-*` Pi plugins. Lockstep versions, single install,
no publish pipeline. Targets Pi Agent CLI
(`@earendil-works/pi-coding-agent`), not Claude Code.

> **This is a standalone fork, not upstream.** `hs1n/pi-monocoque`, forked from
> `juicesharp/rpiv-mono` and **frozen at that project's v2.13.8** (`2d88b79c`, 2026-10-12).
> The `upstream` remote was removed after the final sync: no merge path, none planned.
> Provenance, the MIT obligations that travel with it, and which names belong to upstream
> (`rpiv`, `juicesharp`, the `@juicesharp` scope — not ours): `FORK_NOTICE.md`.
>
> **Nothing is published to npm.** The repo installs into Pi as a Pi source —
> `pi install git:github.com/hs1n/pi-monocoque` — and Pi treats a cloned repo's ROOT as the
> package root with no subdirectory support, which is why the root `package.json` carries
> its own `pi` manifest (that field list IS the install). A live checkout is
> `pi install <checkout path>`; the per-package form is `scripts/fork-pi-install.sh`.
> `origin` is SSH (`git@github.com:hs1n/pi-monocoque.git`); to consult upstream, add it over
> HTTPS and cherry-pick a commit — never merge a branch. Install mechanics and the
> local-path `/rpiv-setup` resolution live in `INSTALL-FORK.md`.

The layout tree, per-package responsibilities, the private/opt-in roster, the new-sibling
checklist, and the full command runbook are in the sibling **`details.md`**, `scripts/`,
and `test/` guidance — NOT auto-injected. Read them when you need the map rather than the
rules.

## Layout and build model
- **Build model**: `noEmit: true` everywhere — packages ship raw `.ts`, which Pi loads directly via the `pi` manifest. No `dist/`, one shared `tsconfig.base.json`, no per-package tsconfig.
- **Plugin discovery**: an extension package's `package.json` carries a `pi` field (`pi.extensions`, optionally `pi.skills`); Pi loads the default-exported function with an `ExtensionAPI`. The root manifest lists all eight extensions plus `packages/rpiv-pi/skills` — a new extension package is invisible to a git/root install until it is added there, and `root-pi-manifest.test.ts` fails the build if you forget.
- **Sibling registry**: `packages/rpiv-pi/extensions/rpiv-core/siblings.ts` is the single source of truth for `/rpiv-setup`, missing-plugin warnings, and presence detection (settings ∪ loaded source paths, plus an optional `marker`). **No runtime imports of siblings** — the zero-cross-imports contract; `LEGACY_SIBLINGS` drives prune-on-upgrade.
- **Opt-in extensions**: opt-in means **absent from `siblings.ts` AND from the root `pi` manifest** — it still rides lockstep + CI via the `packages/*` glob, but nothing installs or suggests it. `rpiv-btw` is the only one. This fork deleted `rpiv-voice`, `rpiv-warp`, `rpiv-telemetry`, `rpiv-site` — anything still naming them is stale.
- **Test runner**: one Vitest at repo root (`include: ['packages/*/**/*.test.ts']`), `test/setup.ts` runs once per worker before any test file imports. Test authoring contract: `.rpiv/guidance/test/architecture.md`.

## Commands

Guard-by-guard runbook, exit contracts, and every fork-only script:
`.rpiv/guidance/scripts/architecture.md` § Commands. The rows below are the ones whose
*shape* matters while editing.

| Command | Why this form |
|---|---|
| `npm run check` | guards → Biome `--write` → `tsc --noEmit`, whole tree. The pre-commit gate |
| `npx tsc --noEmit -p tsconfig.base.json` | Read-only typecheck, no formatter side effects — for probes that must not rewrite files |
| `npm run check:files -- <paths...>` | Path-scoped Biome auto-fix; rewrites ONLY the paths given — a phase's `#### Automated Verification:` stays write-scoped |
| `npm run check:file-sizes` | Size-growth ratchet over `packages/rpiv-pi`; `--update-baseline` to bless growth deliberately |
| `npm test` / `npm run coverage` | Vitest at root / with V8 coverage (the pre-push gate) |
| `npm run versions:sync` / `versions:check` | Root `version` → all 12 packages + intra-monorepo ranges (writes) / verify only (CI) |
| `pi install git:github.com/hs1n/pi-monocoque` | Install as a Pi source; `pi install <checkout path>` for a live tree |

Husky hooks (local-only):
- `pre-commit` — `check:decision-codes` → `check:file-sizes` → `check:skill-names` (fail-fast) → `npm run check`; restages files biome may have rewritten
- `pre-push` — `npm run coverage` with a cleared `coverage/.tmp`, retried once: the v8 provider merges one temp file per test file and a worker recycled under load can leave one missing (`ENOENT coverage/.tmp/coverage-<n>.json`), which would abort an unrelated push. A real failure fails both attempts.

## Conventions

- **Lockstep versions, one source of truth**: the root `package.json` `version` is authoritative; `npm run versions:sync` writes it into every `packages/*` manifest and rewrites intra-monorepo ranges to `^<version>` (`versions:check` in CI). Bump ONE file, never a package. **Naming**: directory `rpiv-<feature>` ↔ npm name `@hs1n/rpiv-<feature>` — module identity and import specifier, not a registry entry.
- **Sibling deps as `peerDependencies: "*"`** — `rpiv-pi` peer-pins every registered sibling and `pi-*` runtime; bundlers never include them.
- **Host-provided packages are always `peerDependencies: "*"`, never `dependencies`** — Pi ships `typebox` and the `@earendil-works/pi-{ai,agent-core,coding-agent,tui}` trio and aliases the bare specifier; an installed copy puts two live copies of one module in a process. Also import only the specifiers the host aliases (`typebox`, `typebox/value`, `typebox/compile`). Rationale, the alias table, and the `jiti` exception: `scripts/architecture.md` § Host-Provided Dependency Guard.
- **Whoever imports declares** — a manifest may not claim a package its own sources never import; enforced by `check:unused-deps`.
- **`files` arrays** list `.ts` source + asset directories explicitly; `.rpiv/` is never shipped; directory entries need a `!**/*.test.ts` negation; dev-only fixture trees are excluded the same way.
- **`type: "module"` everywhere**, Node16 resolution, relative imports carry `.js` from `.ts` source; tests co-locate as `*.test.ts`.
- **No decision-code citations in committed `.ts`** — state the contract in place, never cite parenthesized plan/phase codes (`check:decision-codes`).

## Skill ownership

Three skill sources ship here, and which one answers is not interchangeable:

- `packages/rpiv-pi/skills/` — **ours**. 29 skills; the RPIV pipeline stages carry `contract:` blocks that the `/wf` graphs validate against.
- `skills/matt-pocock/` — Matt Pocock's set, **vendored verbatim** (MIT, `LICENSE` travels with it). It rides at the **lowest** precedence, inside the installed package.
- `skills/skill-master/` — a Pi-native fork of Anthropic's `skill-creator`, the only one edited rather than vendored.

**Three names collide upstream and the vendored set deliberately omits them: `research`,
`implement`, `code-review`.** The omission is load-bearing, not tidiness — all three are
dispatched BY NAME from the built-in `/wf` graphs, so a copy at any higher precedence
(`<cwd>/.agents/skills > <cwd>/.pi/skills > ~/.agents/skills > ~/.pi/agent/skills`) shadows
our body while the graph keeps routing to that name, and the `contract:` is no longer
harvested. `npm run check:skill-names` guards the repo; `session_start` warns when a copy
outside the package shadows a bundled skill. **Never restore those three on the matt side,
and never delete ours.**

**Only 17 of the 52 installed skills are model-invocable** — 7 rpiv utilities
(`commit`, `code-review`, `changelog`, `create-handoff`, `resume-handoff`, `pr-triage`,
`annotate-guidance`), 9 matt skills, and `skill-master`. The other 35 carry
`disable-model-invocation: true` and are reachable only through `/skill:<name>`; the pipeline
index injected at session start is their only map. That split is intentional: **the RPIV
pipeline is developer-driven, matt's set is reached by the agent's own routing** — treat the
second as deliberate, not as drift, and never propose a pipeline stage on your own.

**Where the two meet.** The routing rule, so neither set has to guess:

- A *feature or change request* ("add X", "refactor Y", "make this testable") belongs to the pipeline — name the stage and let the developer run it. Do not run `implement`'s loop yourself.
- A *bug report or failure* ("it throws", "this is slow", "diagnose this") belongs to `diagnosing-bugs`: it is the only diagnosis discipline installed here and no rpiv stage covers it. Use it, then return the fix to the pipeline.
- `tdd` is a *technique inside* a change, not an alternative to one — use it while implementing, never as the plan.
- Vocabulary skills (`codebase-design`, `domain-modeling`, `writing-for-agents`) apply within any work, from either side.

The repo's own `CONTEXT.md`, `docs/adr/`, `docs/agents/` and `.scratch/` are outputs of that
methodology — keep them current rather than reading them as upstream residue.

Full entries, including what is off-limits to swap: `CONTEXT.md` § Skill ownership.

<important if="you are touching tool registration, schemas, or session hooks anywhere in the monorepo">
## Cross-Package Pi Conventions
- Tool params via the standalone `typebox` package (`import { Type } from "typebox"`) `Type.Object({...})`; the `description` field doubles as LLM-facing prompt copy. (Two `rpiv-workflow` test files still import `@sinclair/typebox`.)
- Tool result envelope: `{ content: [{ type: "text", text }], details: <typed object> }` — `details` is the persisted replay snapshot: replay handlers walking the session branch (e.g. rpiv-todo's `replayFromBranch()`, wired to `session_start` / `session_compact` / `session_tree`) rebuild module state from it after compaction or `/reload`.
- pi >= 0.80 hosts export `completeSimple` from pi-ai's `/compat` entrypoint (pre-0.80 hosts: package root, no `/compat`); consumers (`rpiv-advisor`, `rpiv-btw`) call it through `@hs1n/rpiv-side-call`'s `resolveSideCall(modelRegistry)`, which tries `/compat` first and falls back to the root entrypoint only on module-resolution failures. Newer hosts additionally expose an auth-aware `ModelRuntime.completeSimple` facade off `ctx.modelRegistry` — `resolveSideCall` prefers it and reports `mode: "facade"`, whereupon the caller passes only `{ signal }` (never explicit `apiKey`/`headers`, which would bypass credential-derived baseUrl); `mode: "global"` means the caller supplies `apiKey`/`headers`, and only then is a missing literal key fatal.
- System prompts loaded once at module init via `readFileSync(fileURLToPath(new URL("./prompts/X.txt", import.meta.url))).trimEnd()` — ESM-safe, cache-stable.
- Sibling-owned widget pattern: `setWidget(KEY, factory, { placement: "aboveEditor" })` register-once + `tui.requestRender()` on update — see `.rpiv/guidance/packages/rpiv-todo/architecture.md`.
- For tool-specific patterns, consult the relevant package's `.rpiv/guidance/packages/<pkg>/architecture.md`.
</important>
