/**
 * Test-only / framework-internal surface.
 *
 * Exports below are NOT part of the package's authoring or embedding
 * contract. They exist solely for:
 *
 *   - rpiv-pi's regression test that exercises `recordStage` directly
 *     (asserting the JSONL append + stageNumber monotonicity).
 *   - `test/setup.ts`'s per-worker `beforeEach` reset of module-level
 *     singleton state (the built-in workflow registry, the jiti import
 *     cache).
 *
 * Anything that consumers can rely on for production work lives on
 * `./index.js`. This file is reachable as
 * `@hs1n/rpiv-workflow/internal` via the package's `exports`
 * field — keep that path stable so the rpiv-pi test + repo-wide
 * setup don't break.
 *
 * Adding a new export here is a signal you have test-coupling to
 * production state. Reach for it sparingly; prefer making the
 * production module itself idempotent across `beforeEach` resets.
 *
 * These exist because the registries are process-global, and that is NOT a debt
 * to pay off. The four registry slots are WRITTEN by rpiv-pi at load time, through
 * its own module instance, so no instance threaded through `loadWorkflows` could
 * ever receive them — the `Symbol.for` slot is load-bearing and the reset exports
 * below stay. The other two are not global-state problems at all: `strikeBudgets`
 * is a WeakMap keyed by session identity (already self-cleaning), and
 * `overlayCache` is an mtime-validated process-level cache.
 *
 * See `docs/adr/0004-cross-package-registries-stay-global.md` for the verification.
 * Do not re-propose instancing these without reading it.
 */

export { recordStage } from "./audit.js";
export { __resetBuiltIns, flushBuiltInProviders, getBuiltIns } from "./built-ins.js";
export { __resetLifecycleRegistry } from "./events.js";
export { __resetWorkflowExecutionHost } from "./execution-host.js";
export { __resetLoadCache } from "./load/cache.js";
// Read-and-clear a gate's stop-pick note — test fixtures assert the reason a
// bespoke `defineRoute` gate attached via `setRouteNote`; production consumption
// stays inside the runner's routing audit.
export { takeRouteNote } from "./routing-dsl.js";
export { __resetStrikeBudgets } from "./sessions/bash-strikes.js";
export {
	__resetSkillContracts,
	buildEffectiveContracts,
	drainSkillContractCollisions,
	drainSkillContractProviderErrors,
	flushSkillContractProviders,
	getBucketKindMappings,
	getCompositionComparators,
	getSkillContracts,
	harvestStageContracts,
	registerBucketKindMapping,
} from "./skill-contracts/index.js";
// Layout-coupled path helpers — test fixtures that WRITE synthetic run files
// need them; production consumers use the opaque `runFileFor` instead.
export { runsDir, stateFilePath } from "./state/index.js";
// Type-only: lets external test fixtures construct the full mutable run state
// for direct `recordStage` calls. Production consumers read `RunView` instead.
export type { RunState } from "./types.js";
