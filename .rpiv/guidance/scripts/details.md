# scripts/ — guard mechanics and history (NOT auto-injected)

Per-guard reasoning split out of `architecture.md`, which carries only the rules and the
command table. Read this when you are changing a guard's behaviour, arguing about a
violation, or wondering why a pin exists.

## Fresh-Resolution Hazard (why root devDependencies are pinned EXACT)
The old release path deleted `package-lock.json` + `node_modules` and reinstalled ("lockfile
honesty"), so on release day caret specs re-resolved to whatever npm served — that broke
the v2.0.0 release twice: biome `^2.5.0` → 2.5.5 (new lint errors failed pre-commit) and pi
`^0.80.5` → 0.80.10 (`modelRegistry` → `modelRuntime` rename broke tsc). That path is gone,
but the pins stay: the root `devDependencies` are pinned **exact** (biome, tsc, vitest,
coverage, pi-*, typebox, husky) so a fresh `npm install` in a git clone resolves the same
toolchain the tests and `tsc` were verified against. Bump them deliberately in a normal
commit; a Pi host bump is a real change.

## Lockstep Invariant Enforcement
One number, one place. The root `package.json` `version` is authoritative; `sync-versions.js`
stamps it onto every `packages/*` manifest and rewrites each intra-monorepo range to
`^<version>`, printing the per-package diff it applied. `--check` (`npm run versions:check`)
computes the same diff without writing and exits 1 listing every mismatch — CI runs that,
so the invariant stays enforced where it matters and the edit path stays one file.

The direction used to be reversed: 12 hand-written versions had to agree, and drift exited 1
with "bump every package.json by hand, then re-run". That turned one stale number into a
manual repair across twelve, and it only existed because upstream published each package to
npm under its own number — which this fork does not do. `peerDependencies` are deliberately
**untouched** in both modes: rewriting one would smuggle a range into a field that exists to
say "whatever the host or sibling provides".

## Diff-Aware Write (Idempotent)
Both steps are **idempotent**: a manifest is written only when its version or one of its
intra-monorepo ranges would change, in tab-indented JSON + trailing newline (the repo's
`package.json` convention), so re-running on a synced tree produces zero file changes —
verified by an md5 round trip over all 12 manifests.

## Shell-outs
`check-slice-overlap.mjs` is the only script that shells out (to `git`). `sync-versions.js`
and every guard are pure Node with no child processes; the earlier "wrapped shell-out
runner" (echo each command, fail-fast on non-zero exit unless opted out) went with the
release pipeline that needed it. Keep new guards shell-free: a guard that spawns a process
inherits whatever toolchain the workspace happens to resolve.

## Decision-Code Contamination Guard
`check-no-decision-codes.mjs` walks `packages/rpiv-workflow`, `packages/rpiv-pi/extensions/rpiv-core`, and `packages/rpiv-advisor` (`*.ts` only, `node_modules` skipped) and exits 1 on any **parenthesized, case-sensitive** decision-code citation — `(C#|T#|D#|G#|FR#|A#|M#|L#-#|review I#|Slice N|Phase X|Problem N|Decision N|concern-X)`. Review-citation codes (`L#-#`, `review I#`) are additionally flagged anywhere *inside* a parenthesized run, so an article prefix (`(the pre-L4-01 behavior)`) cannot shelter them. The invariant: design-doc decision-codes live in `.rpiv/artifacts/`, never in committed `.ts`. The parens + uppercase gate and `*.ts`-only scope are deliberate — they self-filter plan fixtures in test data and legit `.md` uses, so there is **no allowlist to maintain**.

## File-Size Ratchet Guard
`check-file-sizes.mjs` bounds source-file growth in `packages/rpiv-pi` (the authoring tier): every walked `.ts`/`.js`/`.mjs` file is either **baselined** — allowed to grow at most `max(+10%, +50 lines)` per regeneration cycle — or **unregistered** — allowed only under its class cap (`NEW_FILE_CAP_SOURCE = 1000` lines, `NEW_FILE_CAP_TEST = 3000` for basenames matching `\.test.[cm]?[jt]s$`). A committed ratchet beats fixed thresholds because every raise is a visible baseline diff riding the same commit as the growth it blesses; the knobs are top-of-file constants (single tune point). `node_modules` and `__fixtures__` are skipped anywhere in the walk; declaration twins (`.d.ts`/`.d.mts`) are excluded by suffix. Tests ARE counted — the largest regrowth path observed here was a 9,591-line test monolith — they just get the higher cap. Line counting is newline-normalized `split("\n")`, matching `wc -l` for newline-terminated files.

**Guarded roots**: `GUARDED_ROOTS` is deliberately just `packages/rpiv-pi`; widening to the whole repo is a one-constant edit once the other packages are baselined deliberately.

**Baseline contract** — `file-size-baseline.json` is generated state shaped `{ "files": { "<repo-root-relative posix path>": <line count> } }`, keys sorted, tab-indented + trailing newline. Never hand-edit except to LOWER an entry (tightening the ratchet). `--update-baseline` regenerates from disk and prunes deleted paths; a regen MUST ride the same commit as the growth it registers, so the diff stays reviewable.

**Exit contract**: 0 = within ratchet, with a non-fatal `new files under cap — run --update-baseline` notice for unregistered-but-under-cap files; 1 = per-file `path: N lines > baseline M + allowance A` plus the remediation hint.

## Host-Provided Dependency Guard
`check-host-provided-deps.mjs` walks the root manifest plus every `packages/*/package.json` (filesystem-driven, so a new package is covered on arrival) and exits 1 on any host-provided name in `dependencies` or `optionalDependencies`, or in `peerDependencies` under a range other than `"*"`. Its `HOST_PROVIDED` set is a verbatim copy of the host's own `HOST_PROVIDED_EXTENSION_PACKAGES` (pi `dist/core/resource-loader.js`, including the legacy `@mariozechner/*` spellings and `@sinclair/typebox` next to `typebox`) — parity with the loader is the point: the host warns about this exact shape at startup, and an installed copy reachable by an unaliased path puts duplicate `typebox` / `pi-tui` instances in one process.

`devDependencies` are exempt by design — the root pins the host-provided trio and `typebox` exact so `tsc` and Vitest resolve the host's surface (see "Fresh-Resolution Hazard"), and no package ships them inside its own `dependencies`, so the extension loader never resolves them. Non-host-provided runtime helpers stay real `dependencies` entries: `jiti` is imported by `rpiv-workflow/load/cache.ts` and by rpiv-pi's `skills/elaborate/_helpers/validate-workflow-invariant.mjs`, and is **not** in the host's alias table.

The second half scans `packages/**/*.ts` for `typebox` / `@sinclair/typebox` import specifiers — in `from "…"`, bare `import "…"`, and `require("…")` positions, including dynamic `import()` — and exits 1 on any subpath the host does not alias. The alias table covers exactly six keys: `typebox`, `typebox/compile`, `typebox/value`, and the same three under `@sinclair/typebox`. A bare `typebox` import is redirected to the bundled copy, but `typebox/guard`, `typebox/system`, `typebox/error` and friends resolve against whatever the package tree can reach — with a physical copy installed that is a second live instance, without one it is `ERR_MODULE_NOT_FOUND` at load. Both are runtime failures, so the manifest half alone is not a sufficient invariant. The `@earendil-works/pi-*` specifiers are deliberately **not** enumerated — the repo imports them bare and a host bump moves their subpaths along with them.

## Dependency-Ownership Guard
`check-unused-deps.mjs` answers a question the host-provided guard structurally cannot: not *whether* a declaration is the right shape, but *whose* it is. It walks the root manifest plus `packages/*/package.json`, and for every entry in `dependencies`, `peerDependencies` or `optionalDependencies` requires an import of that specifier — bare, subpath, static, `import()`, side-effect or `require()` — in the declaring package's own sources. Two exemptions, both structural rather than a list of names: host-provided modules (their declaration is policy, and the other guard owns them) and every package name appearing in `packages/rpiv-pi/extensions/rpiv-core/siblings.ts` (the zero-cross-imports contract forbids importing a sibling — presence is detected from settings ∪ loaded extensions — so registering one is the only step needed to license its peer entry). Tests do not count as use: a package imported only from `*.test.ts` is a devDependency wearing a runtime declaration.

The failure it catches is silent in both directions. `yaml` rode rpiv-pi's `peerDependencies` while nothing in the repo imported it; `jiti` and `@standard-schema/spec` were declared by both rpiv-pi and rpiv-workflow while only rpiv-workflow imported them. Every one of those read as intent to the next reader. The counter-example is why the guard is worth running rather than eyeballing: `jiti` looks equally unused from rpiv-pi's *extension* sources, but `skills/elaborate/_helpers/validate-workflow-invariant.mjs` imports it, so its rpiv-pi peer entry is load-bearing and stays.

## Skill-Name Collision Guard
`check-skill-name-collisions.mjs` compares the two configured skill sets — `skills/matt-pocock/` (vendored, shipped by the root `pi` manifest) and `packages/rpiv-pi/skills/` — and exits 1 on any directory name holding a `SKILL.md` in both. Three names collide in the two upstream collections — `research`, `implement`, `code-review` — and all three are dispatched **by name** from the built-in `/wf` workflows (`implement` an `acts` stage in all four, `code-review` a gate stage in polish and vet, `research` build's second stage), which is why the vendored set excludes them; `CONTEXT.md` records that omission as load-bearing and `skills/matt-pocock/README.md` explains it to whoever updates the directory.

The guard exists because updating the vendored set means re-applying the exclusions **by hand**, and a forgotten exclusion fails silently: precedence runs `<cwd>/.agents/skills > <cwd>/.pi/skills > ~/.agents/skills > ~/.pi/agent/skills > installed package`, so a duplicate anywhere above the package shadows rpiv-pi's body while the graph keeps routing by that name, and the `contract:` those graphs validate against is harvested by a separate provider that finds nothing to replace it with (matt's skills declare none). It compares **directory names**, not frontmatter, because Pi discovers skills by directory and merely warns when a declared `name:` differs from its parent — so directory names are what collide at load time; a directory without a `SKILL.md` is skipped, which is how `packages/rpiv-pi/skills/_shared` stays out. A **missing** root is a failure rather than an empty set, so a layout change cannot silently void the comparison.

The runtime half of the same trap lives outside this directory: rpiv-core's `skill-shadow.ts` probes those same precedence directories at `session_start` and warns when a bundled skill resolves to a copy outside the package.
