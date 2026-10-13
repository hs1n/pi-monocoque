# rpiv-workflow — module map, grammar and exports (NOT auto-injected)

Reference material split out of `architecture.md` so the auto-injected block carries
the rules that decide whether a change is correct. Read this when you are changing
the loader, the runner, the command surface, or the public exports.

## Monorepo Context

Published Pi extension in `rpiv-mono`. Lockstep version with the rest of the
`@hs1n/rpiv-*` family. Listed in `siblings.ts`; suggested by `/rpiv-setup` and
pre-pinned in rpiv-pi's `peerDependencies`.

## `/wf` Command Surface (flag grammar)

`FLAG_EXTRACTORS` declares the flag set — `--name <run-name>`, `--max-jumps <n>`
(backward-jump cap), `--max-laps <n>` (lap ceiling) — peeled from leading/trailing
positions only via a fixpoint pass; a repeated flag keeps the FIRST-TYPED value in
every slot (typed-offset arbitration) and warns (`MSG_FLAG_REPEATED`); a mid-position
caps token is absorbed silently while a mid `--name` warns. `@resume` drops `--name`
(`MSG_NAME_IGNORED_ON_RESUME`). The parsed `preview` kind is decided on the
FLAG-STRIPPED residual, so `/wf <flags> <workflow>` previews that workflow. A cap at
or above the lap ceiling warns (`MSG_JUMP_CAP_ABOVE_LAP_CEILING`). Caps thread into
`runWorkflow`/`resumeWorkflowByRunId` options; malformed programmatic budgets are
refused pre-flight (`validateRunBudgets`). The run-path module is memoized behind a
pre-warm timer (`PREWARM_DELAY_MS`) and stale-context notifications drop silently.

## Dependencies

- **`@earendil-works/pi-coding-agent`** (peer): structural host types only, no value imports. **`@standard-schema/spec`** (peer): standard-schema interop for the validation surface
- **`typebox`** (`peerDependencies: "*"`, host-provided): `outputSchema` validation for `produces()` stages (`typebox-adapter.ts`). Pi supplies and aliases `typebox` at load time, so it is never a `dependencies` entry (v2.12.0, #282). **`jiti`** (dependency): loads user `.ts` overlays without a build step. **`@hs1n/rpiv-config`** (dependency): `configPath` for the user layer

## Consumers

- **`@hs1n/rpiv-pi`** — registers a lazy provider via `registerBuiltInsProvider` from the `/startup` entry (`registerBuiltIns(builtInWorkflows)` = build/vet/polish/ship, built on first `/wf`, not startup); auto-wires bucket-narrowed `rpivBucketOutcome(bucket)` onto contract-backed `produces()` stages at load time via `registerOutcomeDeriver` (`skill-contracts/extension-points.ts`, re-exported through `/registration` + `/startup`); stages with explicit outcomes (e.g. the verdict outcomes in rpiv-pi's `built-in-workflows.ts`) keep theirs

## Module Structure

```
api.ts (barrel) → stage-def.ts / loop-def.ts / routing-dsl.ts / output-spec.ts
      — Authoring DSL: StageDef union + factories, loop vocabulary, EdgeFn/defineRoute/gate + route notes,
        Output envelope. api.ts only re-exports — each concept has ONE home (stage-identity.ts is consumed
        by chain-state/validate/runner, not the barrel)
command.ts, command-run.ts, preview.ts
      — /wf registration (flag extractors, lazy pre-warmed run path), run path (parse → loadWorkflows →
        runWorkflow), read-only pretty-printers
runner/, load/, state/, sessions/, outcomes/, validate/, skill-contracts/
      — Engine subsystems (each has its own architecture.md): budgets + stage lifecycle + resume,
        layered jiti loader, JSONL run log, detached-session plumbing, bundled outcomes, static
        validation + contract registry extension points
host.ts, execution-host.ts, semaphore.ts
      — Detached-execution ports: `spawnChild`/`maxConcurrency` host ctx + launcher/session subtypes,
        executor-provider seam (rpiv-pi's `SdkWorkflowHost`), FIFO concurrency gate
registration.ts, startup.ts, extension.ts, index.ts
      — Runner-free public surface, ~9ms startup-registrar entry, Pi extension entry, barrel
skill-contract.ts, validate-workflow.ts (thin orchestrator over validate/), validate-output.ts,
   validation-bounds.ts, json-schema.ts, schema-compat.ts, typebox-adapter.ts
      — Contract registry + static/runtime validation + schema interop; every issue carries a `code` +
        `params` (assert/filter on codes, never message text)
loop.ts, loop-kinds.ts, loop-parallel.ts, loop-waves.ts
      — THE unit-loop driver, per-kind strategy table, bounded-parallel dependency-ordered fanout
        dispatch (retryHaltedUnits re-dispatch with per-attempt snapshots), Kahn topological wave levels
events.ts, triggers.ts, routing.ts, audit.ts/audit-ctx.ts/audit-rows.ts, handle.ts, chain-state.ts,
   built-ins.ts, stage-errors.ts, layers.ts, messages.ts, docs-protocol.ts, internal-utils.ts, types.ts,
   death-scene.ts, failure-memos.ts, worktree-digest.ts
      — Runtime plumbing: lifecycle hooks, triggers, routing exec, audit layer, chain-state authorities,
        built-in registry, message constants, docs system-prompt protocol; failure-path resilience above
└── internal.ts — Test-only exports (getBuiltIns, recordStage, runsDir, takeRouteNote, __resetStrikeBudgets, …)
                  reached via `@hs1n/rpiv-workflow/internal`
```

## Layer paths

| Role | Path (user layer) | Path (project layer) |
|---|---|---|
| **Pack** files (`packs/*.ts`, alpha-sorted) | `~/.config/rpiv-workflow/packs/*.ts` | `<cwd>/.rpiv/workflows/packs/*.ts` |
| **Config** file (the one hand-edited file) | `~/.config/rpiv-workflow/config.ts` | `<cwd>/.rpiv/workflows/config.ts` |

## Detached execution mechanics

Every stage runs in an isolated child session the host spawns via
`WorkflowHostContext.spawnChild` (up to `maxConcurrency` in flight;
`reattach`/`fork` reopen or fork a persisted session for resume and
`sessionPolicy: "continue"`).

`fanout()` takes `concurrency`, `depArtifactFlag`, `retryHaltedUnits`. Route notes
(`setRouteNote`) ride every recap (`RunRecap.routingNotes`).

## Public API (grouped by audience)

| Audience | Key exports |
|---|---|
| Authoring DSL (config + pack authors) | `defineWorkflow`, `produces`, `acts`, `terminal`, `defineRoute`, `gate`, `setRouteNote`, `fanout`/`iterate`/`assess`, `fanin`, `judge`/`panel`/`verify`, `match`/`majority`/`all`/`any`, `gt`/`gte`/`lt`/`lte`/`eq`, `READS_DATA`, `marksReadsData`, `Workflow`, `StageDef`, `StageKind`, `typeboxSchema`, `describeFlow`, `loopSpecOf`/`judgeSpecOf` |
| Programmatic embedders | `runWorkflow`, `runWorkflowByName`, `resumeWorkflow`, `resumeWorkflowByRunId` (+ `*Options` incl. `RunBudgetOptions`), `RunWorkflowResult`, `WorkflowHost`, `WorkflowHostContext`/`WorkflowSessionContext`, `ModelSelection`, `MAX_BACKWARD_JUMPS`/`MAX_LAPS`/`MAX_ITERATIONS`, `validateRunBudgets` |
| Loader consumers | `loadWorkflows`, `LoadedWorkflows` (carries required `skillAliases` + `skillContracts`), `Issue`, `LoadIssue`, `ConfigLayer`, `OverlayPaths`, `projectOverlayPaths`, `userOverlayPaths`, `aliasSkills` |
| Sibling packages (via the ~9ms `/startup` entry) | `registerBuiltIns`, `registerBuiltInsProvider`, `registerLifecycle`, `registerWorkflowExecutionHost`, `registerSkillContracts(Provider)`, `registerOutcomeDeriver` (skill-contract extension points), `summarizeRun` |
| Custom outcome authors | `Outcome` (`OutputSpec` is its deprecated pre-rename alias), `ArtifactCollector`, `ArtifactParser`, `CollectContext`/`ParseContext`/`SnapshotContext`, `defineCollector`, `defineParser` |
| State inspection | `listRuns`, `readHeader`, `readLastStage`, `readLoopCaps`, `resolveRun`, `listArtifacts`, `summarizeRun`/`RunRecap`, `runFileFor` (the one OPAQUE path projection), `STATE_SCHEMA_VERSION` |
| Bundled outcomes catalog | `sideEffectOutcome`, `gitCommitOutcome`; collectors `transcriptPathCollector`, `toolCallCollector`, `workspaceDiffCollector`, `gitCommitCollector`, `directoryPathCollector`, `urlCollector`, `unionCollectors`, `noopCollector`; parsers `jsonBodyParser`, `gitCommitParser` |
