/**
 * session-fields — the fields EVERY `StageSessionContext` derives from the run, in one place.
 *
 * Two builders assemble that context: `buildSingleStageSession` (runner/run-stage.ts) for a whole
 * stage, and `buildUnitSession` (loop-kinds.ts) for one fan-out unit. Eleven of their fields were
 * the same expression over the same `run` — `cwd`, `runId`, `state`, the memo-suffixed `prompt`,
 * `skill`, `lifecycle`, `runIdentity`, `skillContracts`, `model`, `readSessionBranch`,
 * `worktreeDigest` — so a new run-derived field had to be remembered in two literals, and the only
 * thing keeping the two prompts' memo composition identical was that someone had copied it
 * correctly twice. Here it is one function: adding a run-derived field to `StageSessionContext` is
 * a change in this file.
 *
 * What does NOT live here is as deliberate as what does. `signal` is a run-level abort on the
 * single-stage path and a per-generation abort on the unit path; `unit`, `collectAll`,
 * `laneUnitIndex` and `attemptOrdinal` have no meaning for a stage that is not a fan-out. Those
 * stay explicit in each literal, so "this path has no unit" reads as a visible absence rather than
 * as an omitted key of a shared spec — an optional key in a spec is exactly the shape that goes
 * missing silently, which is what this module exists to avoid.
 *
 * Lives BELOW both builders (it imports neither), so the dependency direction the cycle guard
 * enforces is untouched: the two assemble from here, and there is no back-edge.
 */

import { runIdentityOf } from "./audit.js";
import { failureMemoSuffix } from "./failure-memos.js";
import type { RunContext, StageSessionContext } from "./types.js";

/**
 * The run-derived half of a stage session context. `input.stage` is the MACHINE stage name — the
 * unit path's display name is decorated and its model lookup still keys on the undecorated parent.
 *
 * No return annotation on purpose: the literal's inferred type keeps every property required, so
 * spreading it into a builder's object still has to satisfy `StageSessionContext` in full, while
 * `satisfies` below rejects a key that is not a real field.
 */
export function runDerivedSessionFields(run: RunContext, input: { prompt: string; stage: string; skill: string }) {
	return {
		cwd: run.cwd,
		runId: run.runId,
		state: run.state,
		// The failure memo rides EVERY session prompt (the additive-injection rule), so its
		// composition has one site instead of one per path.
		prompt: input.prompt + failureMemoSuffix(run.state),
		skill: input.skill,
		lifecycle: run.lifecycle,
		runIdentity: runIdentityOf(run),
		skillContracts: run.skillContracts,
		model: run.resolveModel?.({ workflow: run.workflow.name, stage: input.stage, skill: input.skill }),
		readSessionBranch: run.readSessionBranch,
		worktreeDigest: run.worktreeDigest,
	} satisfies Partial<StageSessionContext>;
}
