# load/

Layered jiti loader for `defineWorkflow` overlays. Discovers built-in + user +
project layers, jiti-imports each `.ts` file, normalises the default export, merges
by workflow name with last-write-wins precedence, applies per-key `skillAliases`
(project ⊕ user) to every workflow before validation, runs the skill-contract phase,
surfaces one-shot legacy advisories, and resolves the run-default workflow.

**Never throws** — every failure surfaces as an `Issue` on `LoadedWorkflows`.

The module map, the dependency list, the accumulator/normaliser code, and the
legacy/mtime-cache mechanics are in `details.md` beside this file — NOT
auto-injected. Read it when you are changing a layer source, a shape guard, or the
import cache.

## Issue Accumulator (never-throws contract)
```ts
export interface LoadIssue { kind: "load"; layer: LoadIssueOrigin; path?: string; severity: "error"|"warning"; message: string; }
export type Issue = LoadIssue | (WorkflowValidationIssue & { kind: "validation"; layer: ConfigLayer; path?: string });
```
The runner gates on `severity === "error"` issues; callers (`command-run.ts`) decide
block vs warn. Even built-in provider throws honour the contract:
`flushBuiltInProviders()` RECORDS them (never propagates), and `loadWorkflows` drains
each via `drainBuiltInProviderErrors()` into a `layer: "framework"` warning BEFORE
reading `getBuiltIns()` — a provider that throws before registering contributes its
error but (correctly) no workflows. The skill-contract phase additionally drains
cross-owner contract collisions as framework warnings, and deriver mutations land on
per-load shallow stage copies so the global registry and the mtime cache are never
mutated in place.

## Layer cascade (insertion order = precedence)
`built-in → user packs (alpha-sorted) → user config → project packs → project config`;
later wins. `applySkillAliases` runs BEFORE the contract phase, which runs BEFORE
validation. Layer banners in issues are conditional: `"built-in"` appears only when
built-ins exist, and each layer banner only when that layer contributed. An empty
aggregate moves on to `resolveDefault` (project config > user config > first
registered; a stale name becomes an `Issue`).

## Tagged-result normaliser (no exceptions across the boundary)
`normalizeDefaultExport` returns `{ kind: "ok"; value } | { kind: "err"; error }` —
it NEVER throws. `FileKind` (`"config"` | `"pack"`) discriminates capability: only
`config` may carry `default` AND `skillAliases`; a pack exporting the envelope is
hard-rejected there — one source of truth per layer. The envelope shape is
`{ workflows?, default?, skillAliases? }` with ≥1 field present (alias-only is
valid). Also hard-rejected: empty `Workflow[]`, non-Workflow array members, bare
multi-entry arrays (envelope required), non-array `workflows`, non-`Record<string,string>`
`skillAliases`. **Keep `isEnvelope` (`shape-guards.ts`) and the shape table in
`normalize.ts`'s top jsdoc in sync.**

## Skill-alias application (`alias.ts`)
`applySkillAliases(acc, userOutcome, projectOutcome)` merges project ⊕ user (project
wins per-key), early-exits on an empty map, snapshots pre-remap dispatched skills, and
rewrites workflows via the pure `aliasSkills(w, merged)`. Rules:

- `aliasSkills` returns `w` BY REFERENCE when nothing changed, else an `Object.freeze`d copy — **shared built-ins are never mutated**
- **One hop only**: alias targets are not re-aliased
- `userAliases`/`projectAliases` are walked SEPARATELY so a no-op warning is attributed to the layer that actually declared the key (same key dead in both → two warnings)
- The `merged` map is returned verbatim for `LoadedWorkflows.skillAliases`

`LoadedWorkflows` carries two required derived fields: `skillAliases` (`{}` when
none — already applied to every dispatching stage) and `skillContracts:
SkillContractMap` (declared merged over harvested; empty `Map` when none).

## Architectural Boundaries
- **Never throws to caller** — every failure path becomes an `Issue`
- **Mutable `LoadAccumulator` threaded through helpers** — new loader features add a field, not a parameter
- **Pack files cannot set `default` OR declare `skillAliases`** — both envelope-only fields are hard-rejected on packs, eliminating "who set this?" ambiguity across overlapping packs
- **Internal-only surfaces** — `applySkillAliases` is loader-internal, exported from `alias.ts` for `index.ts` only (the sibling-facing surface is `aliasSkills`, the pure transform); `__resetLoadCache` is test-only via `../internal.ts`, NOT the public barrel
- **Overlays resolve this package and `typebox` through `virtualModules`, never through disk** — overlays live outside any `node_modules` tree and outside Pi's extension module mapping, so `overlayVirtualModules()` maps `@hs1n/rpiv-workflow` (`.`, `/registration`, `/startup`, `/runner` — NOT `/internal`) to the running package's entries and `typebox` (`/value`, `/compile`, each fail-soft) to the copy this package received from Pi, mirroring Pi's own loader (#298). Built lazily on first overlay import so the thin startup/registration graph never pulls the runner. Other bare imports still use Node resolution from the overlay's folder
- **Overlay code is trusted local code** — jiti synchronously evaluates overlay top-level code on first load and on every edit (same trust level as a node script)

<important if="you are adding a new layer source (e.g. workspace overlay)">
1. Add the literal to `ConfigLayer` in `../layers.ts`
2. Export `<name>OverlayPaths(...): OverlayPaths` in `paths.ts`
3. In `index.ts`, call `loadLayer(<name>OverlayPaths(...), "<name>", acc)` at the correct precedence slot — later call = higher precedence
4. If the layer can set a default, add it to the `candidates` list in `resolve-default.ts` above lower-precedence layers
5. If the layer can declare `skillAliases`, thread its `LayerOutcome` into `applySkillAliases(...)` so its keys (a) participate in the merged map at the new layer's precedence and (b) receive correct per-source-layer no-op attribution
6. Update `load.test.ts` precedence cases (both workflow-name and skill-alias paths)
</important>

<important if="you are adding a new default-export shape or shape guard">
1. Structural? Export `isFoo(v: unknown): v is Foo` in `shape-guards.ts` (typeof/Array.isArray only — no zod, no `instanceof`)
2. Add a branch in `normalizeDefaultExport` returning `{ kind: "ok" | "err" }` — NEVER throw
3. Per-`FileKind` policy: hard-reject envelope-style features when `kind === "pack"` (the policy that today rejects `default` AND `skillAliases` on pack files)
4. Envelope shape today is `{ workflows?, default?, skillAliases? }` with at least one field present (alias-only envelope is valid); a new envelope field appends to this list — update `isEnvelope` in `shape-guards.ts` AND the shape table in `normalize.ts`'s top jsdoc together so the runtime + doc surface don't drift
5. Cover null/undefined/wrong-typeof branches in co-located unit tests — integration paths rarely reach them
</important>
