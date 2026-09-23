# load/ — module map and mechanics (NOT auto-injected)

Reference material split out of `architecture.md`. Read this when you are changing a
layer source, the import cache, the legacy advisories, or the module layout.

## Dependencies

- **`jiti`**: ESM-aware `.ts` import without a build step; module cache OFF so `/reload` picks up edits (fs transform cache stays on — content-hash validated, edit-safe)
- **`@hs1n/rpiv-config`**: `configPath(...)` resolves `~/.config/rpiv-workflow/` for the user layer
- **`../api`, `../built-ins`, `../layers`, `../validate-workflow`, `../skill-contract` + `../skill-contracts`, `../stage-identity`, `../validate/issue`, `../internal-utils`**: `Workflow` type, built-in registry + provider error drain, `ConfigLayer` union, validation pass, contract-registry machinery, `isDispatchingStage`/`resolveSkill`, `WorkflowValidationIssue`, `formatError`

## Consumers

- `command-run.ts` — `/wf` dispatch (`findWorkflow`, `loadWorkflows`)
- `preview.ts` — type-only `LoadedWorkflows` for the picker (renders `skillAliases` as a banner)
- Public surface via `../registration.ts` (re-exported transitively by `../index.ts`): `loadWorkflows`, `Issue`, `LoadedWorkflows`, `OverlayPaths`, `projectOverlayPaths`, `userOverlayPaths`, `aliasSkills`
- `../internal.ts` — exposes `__resetLoadCache` for tests (NOT the public barrel)

## Module Structure

```
issues.ts            — LEAF: LoadIssue + Issue (layer/path-attributed wrapper over WorkflowValidationIssue); LoadIssueOrigin adds "framework"
paths.ts             — OverlayPaths {configFile, packsDir}; project/user path factories
legacy.ts            — Legacy-layout advisories: LEGACY_* notice strings + pushLegacyNotices probes
skill-contract-phase.ts — applySkillContractPhase: provider flush/drain + effective registry + derivers
shape-guards.ts      — Structural predicates (isWorkflow, isEnvelope) + describe (formatError is ../internal-utils.ts)
normalize.ts         — FileKind="config"|"pack" + normalizeDefaultExport → tagged NormalizeResult
cache.ts             — Module-singleton jiti + mtime-keyed overlayCache; __resetLoadCache for tests
merge.ts             — LoadAccumulator + LayerOutcome + loadLayer/loadOverlayFile/mergeOverlay
resolve-default.ts   — Project default > user default > first registered; stale name → Issue
alias.ts             — isDispatchingStage + aliasSkills (pure transform) + applySkillAliases (loader-internal)
index.ts             — Orchestrator loadWorkflows(cwd) + findWorkflow + public types/barrel
```

`issues.ts` is a leaf so `merge.ts` can name `Issue` without importing the
orchestrator back. `layer`/`path` attribution lives ONLY on the loader wrapper —
`WorkflowValidationIssue` carries `code`/`params`/`message` and knows nothing about
layers.

## Issue Accumulator shape

```ts
export interface LoadIssue { kind: "load"; layer: LoadIssueOrigin; path?: string; severity: "error"|"warning"; message: string; }
// LoadIssueOrigin = ConfigLayer | "framework"
try { raw = await cachedImport(path); } catch (e) { loadError(acc, layer, path, `failed to import ${path}: ${formatError(e)}`); return undefined; }
```

## Normaliser shape

```ts
export type NormalizeResult = { kind: "ok"; value: ParsedConfig } | { kind: "err"; error: string };
// FileKind discriminates capability: only "config" may carry `default` AND `skillAliases`; packs exporting
// the envelope are hard-rejected here — one source of truth per layer.
if (isEnvelope(raw) && kind === "pack") return { kind: "err", error: /* envelope is config-only */ };
```

## Layer cascade (the code)

```ts
// built-in → user packs (alpha-sorted) → user config → project packs → project config; later wins.
for (const err of drainBuiltInProviderErrors())    // drain recorded provider throws first (see never-throws)
  acc.issues.push({ kind: "load", layer: "framework", severity: "warning", message: `built-in provider failed: ${formatError(err)}` });
for (const w of getBuiltIns()) acc.workflowMap.set(w.name, w);
const userOutcome    = await loadLayer(userOverlayPaths(),       "user",    acc);
const projectOutcome = await loadLayer(projectOverlayPaths(cwd), "project", acc);
const skillAliases = applySkillAliases(acc, userOutcome, projectOutcome);  // BEFORE the contract phase + validation
applySkillContractPhase(acc, /* … */);                                     // registry + derivers, between aliasing and validation
for (const w of acc.workflowMap.values()) for (const v of validateWorkflow(w, { skillContracts })) acc.issues.push({ ...v, kind: "validation", layer, path });
const defaultName = resolveDefault(projectOutcome.configDefault, userOutcome.configDefault, acc);
```

## Legacy advisories

`legacy.ts` owns both the notice strings and the probes (`pushLegacyNotices`, called by
`index.ts`): `LEGACY_OVERLAY_NOTICE` (`.rpiv-workflow/`), `LEGACY_RUNS_NOTICE`,
`LEGACY_USER_CONFIG_NOTICE` — each carrying its migration shell. The dashed
directories are no longer read; these advisories are the only signal. Sunset target
~3 release cycles post-1.0 — remove each `existsSync` gate, its message constant, and
the co-located test case together.

## mtime-keyed import cache (loader ↔ jiti boundary)

```ts
const jiti = createJiti(import.meta.url, { moduleCache: false });  // module cache off, fs transform cache kept; mtime-keyed overlayCache re-imports on edit
export async function cachedImport(path: string): Promise<unknown> {
  const cached = overlayCache.get(path), stat = statSync(path);
  if (cached && cached.mtimeMs === stat.mtimeMs) return cached.parsed;  // hit
  const value = await jiti.import(path, { default: true });             // strip ESM default
  overlayCache.set(path, { mtimeMs: stat.mtimeMs, parsed: value }); return value; }
```
