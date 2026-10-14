/**
 * Fold-semantics tests for `foldTrail` — the values-in/values-out half of
 * resume reconstruction. Every test here hands the fold a LITERAL trail (the
 * rows plus the routed-stop separator map the strict reader would have built)
 * and asserts what those rows MEAN:
 *
 *   1. State transitions — named slots, `lastSession`, side-effect / terminal
 *      stages, failed / aborted / skipped trailing rows, `stage-gone`
 *   2. Loop generations — fanout (placement + drift + the recorded-generation
 *      authority), iterate, assess, verify, panel verdicts
 *   3. Replay parity — the reconstructed cursor against the live transition
 *   4. `entryArgs` freeze at generation open, and `lastGatedDispatch` transience
 *   5. `lastChainIndex` — one activation per top-level row or loop generation
 *   6. Gate-stop trailers — the routed-stop separator map and the `gateStop` arm
 *
 * Everything that asserts the FILE, the HEADER, or the `reconstructState` entry
 * point stays in `resume.test.ts` (the schema-version gate, the strict reader's
 * refusals, the no-rows refusal), as do the end-to-end `resumeWorkflow` drives.
 */

import { describe, expect, it } from "vitest";
import { type FanoutFn, type IterateFn, produces, type Workflow } from "../api.js";
import { stageEntryArgs } from "../chain-state.js";
import type { Artifact } from "../handle.js";
import { fs as fsHandle, handleToString } from "../handle.js";
import { judge } from "../judge.js";
import { assess, fanout, iterate, majority, panel, verify } from "../loop-constructors.js";
import { advanceCursor, foldFanoutCompletion, freshCursor } from "../loop-kinds.js";
import type { Output } from "../output.js";
import type { RoutingDecision, WorkflowStage } from "../state/index.js";
import type { RunState } from "../types.js";
import { foldTrail, type ResumeContext } from "./resume.js";

// ---------------------------------------------------------------------------
// Fixtures — literals only: the fold reads no file, so nothing here touches disk
// ---------------------------------------------------------------------------

/** The header's `runId` — only the rebuilt collected-sentinel meta carries it. */
const FOLD_RUN_ID = "2026-06-03_07-30-00-ab12";

/**
 * The fold's non-trail inputs. `cwd` is carried, never read: it reaches only the
 * loop-kind author fns (`units` / `next`), which these fixtures ignore.
 */
const FOLD_CTX: ResumeContext = { cwd: "/tmp/rpiv-workflow-fold", runId: FOLD_RUN_ID, input: "Add dark mode" };

const fakeArtifact = (path: string): Artifact => ({ handle: fsHandle(path), role: "primary" });

const fakeOutput = (artifacts: readonly Artifact[] = []): Output => ({
	kind: "artifacts",
	artifacts,
	data: {},
	meta: { stage: "test", stageNumber: 1, ts: "", runId: "" },
});

/**
 * Minimal named outcome for fold tests. The collector is never invoked — the
 * fold replays persisted rows, not live sessions — so a stub that
 * satisfies `Outcome` is sufficient. `name` drives `resolvePublishName`.
 */
const makeOutcome = (
	name: string,
): import("../output-spec.js").Outcome<unknown, "artifact-md", Record<string, unknown>> & { name: string } => ({
	name,
	collector: { collect: () => ({ kind: "ok", artifacts: [] }) },
});

/** Minimal 3-stage produces workflow used by most tests. */
const linearWorkflow: Workflow = {
	name: "test-wf",
	start: "plan",
	stages: {
		plan: { kind: "produces", sessionPolicy: "fresh" },
		build: { kind: "produces", sessionPolicy: "fresh" },
		deploy: { kind: "produces", sessionPolicy: "fresh" },
	},
	edges: {
		plan: "build",
		build: "deploy",
		deploy: "stop",
	},
};

/** Workflow with a side-effect stage between two produces. */
const sideEffectWorkflow: Workflow = {
	name: "test-wf",
	start: "plan",
	stages: {
		plan: { kind: "produces", sessionPolicy: "fresh" },
		commit: { kind: "side-effect", sessionPolicy: "fresh" },
		build: { kind: "produces", sessionPolicy: "fresh" },
	},
	edges: {
		plan: "commit",
		commit: "build",
		build: "stop",
	},
};

/** Workflow with a terminal stage. */
const terminalWorkflow: Workflow = {
	name: "test-wf",
	start: "plan",
	stages: {
		plan: { kind: "produces", sessionPolicy: "fresh" },
		cleanup: { kind: "side-effect", sessionPolicy: "fresh", inheritsArtifacts: false },
	},
	edges: {
		plan: "cleanup",
		cleanup: "stop",
	},
};

/** A structured loop-unit row (the machine channel — `stage` is display only). */
const fanoutUnitRow = (
	parent: string,
	unitId: string,
	unitIndex: number,
	num: number,
	output: Output | undefined,
	status: WorkflowStage["status"] = "completed",
): WorkflowStage => ({
	session: null,
	stageNumber: num,
	stage: `${parent} (${unitId})`,
	skill: parent,
	status,
	ts: `t${num}`,
	parent,
	role: "produce",
	unitId,
	unitIndex,
	...(output ? { output } : {}),
	...(status === "failed" ? { errMsg: "boom" } : {}),
});

const assessProduceRow = (parent: string, round: number, num: number, output: Output): WorkflowStage => ({
	session: null,
	stageNumber: num,
	stage: `${parent} (r${round}·produce)`,
	skill: parent,
	status: "completed",
	ts: `t${num}`,
	parent,
	role: "produce",
	unitIndex: round,
	output,
});

const assessJudgeRow = (
	parent: string,
	judgeSkill: string,
	round: number,
	num: number,
	output: Output,
): WorkflowStage => ({
	session: null,
	stageNumber: num,
	stage: `${parent} (r${round}·judge)`,
	skill: judgeSkill,
	status: "completed",
	ts: `t${num}`,
	parent,
	role: "judge",
	unitIndex: round,
	output,
});

/** A panel member's judge row — identity-bearing (`#{memberIndex}` in `unitId`). */
const assessPanelJudgeRow = (
	parent: string,
	judgeSkill: string,
	round: number,
	memberIndex: number,
	num: number,
	output: Output,
): WorkflowStage => ({
	session: null,
	stageNumber: num,
	stage: `${parent} (r${round}·judge#${memberIndex})`,
	skill: judgeSkill,
	status: "completed",
	ts: `t${num}`,
	parent,
	role: "judge",
	unitId: `r${round}·judge#${memberIndex}`,
	unitIndex: round,
	output,
});

/** A member verdict Output carrying `{ done }` data the per-member `pred` reads. */
const memberVerdict = (path: string, isDone: boolean): Output => ({
	kind: "artifacts",
	artifacts: [fakeArtifact(path)],
	data: { done: isDone },
	meta: { stage: "test", stageNumber: 1, ts: "", runId: "" },
});

const verifyAttemptRow = (parent: string, attempt: number, num: number, output: Output): WorkflowStage => ({
	session: null,
	stageNumber: num,
	stage: `${parent} (a${attempt}·attempt)`,
	skill: parent,
	status: "completed",
	ts: `t${num}`,
	parent,
	role: "produce",
	unitIndex: attempt,
	output,
});

const verifyVerdictRow = (
	parent: string,
	judgeSkill: string,
	attempt: number,
	num: number,
	output: Output,
): WorkflowStage => ({
	session: null,
	stageNumber: num,
	stage: `${parent} (a${attempt}·verify)`,
	skill: judgeSkill,
	status: "completed",
	ts: `t${num}`,
	parent,
	role: "verify",
	unitIndex: attempt,
	output,
});

/** A routed-stop RoutingDecision row (`chain-advance`'s stop-branch audit shape). */
const stopRow = (fromStage: string, fromStageIndex: number, note?: string): RoutingDecision => ({
	type: "routing",
	fromStageIndex,
	fromStage,
	decision: "stop",
	...(note !== undefined ? { note } : {}),
	ts: `t${fromStageIndex}`,
});

/** The sessionless terminal failure row `haltChain` appends behind the stop row. */
const gateHaltRow = (stage: string, num: number): WorkflowStage => ({
	session: null,
	stageNumber: num,
	stage,
	status: "failed",
	ts: `t${num}`,
	errMsg: `Routing gate after "${stage}" matched no branch: gate failed`,
});

describe("foldTrail", () => {
	it("produces-only linear chain: advances primary, appends named, tracks counters", async () => {
		const art1 = fakeArtifact("plans/p1.md");
		const art2 = fakeArtifact("plans/p2.md");
		const out1 = fakeOutput([art1]);
		const out2 = fakeOutput([art2]);

		const rows: WorkflowStage[] = [
			{
				session: null,
				stageNumber: 1,
				stage: "plan",
				skill: "plan",
				status: "completed",
				ts: "2026-06-03T07:31:00Z",
				output: out1,
			},
			{
				session: null,
				stageNumber: 2,
				stage: "build",
				skill: "build",
				status: "completed",
				ts: "2026-06-03T07:35:00Z",
				output: out2,
			},
		];

		const result = await foldTrail({ rows, stopBefore: new Map() }, FOLD_CTX, linearWorkflow);

		expect(result.ok).toBe(true);
		if (!result.ok) return; // type narrow

		expect(result.state.primaryArtifact).toStrictEqual(art2);
		expect(result.state.output).toStrictEqual(out2);
		expect(result.state.stagesCompleted).toBe(2);
		expect(result.state.lastAllocatedStageNumber).toBe(2);
		expect(result.state.named.plan).toEqual([out1]);
		expect(result.state.named.build).toEqual([out2]);
		expect(result.state.originalInput).toBe("Add dark mode");
		expect(result.visited).toEqual(new Set(["plan", "build"]));
		expect(result.lastStageNumber).toBe(2);
		expect(result.rows).toHaveLength(2);
	});

	it("reconstructs lastSession from the most recent completed single-stage row (cold continue forks it on resume)", async () => {
		const out1 = fakeOutput([fakeArtifact("plans/p1.md")]);
		const out2 = fakeOutput([fakeArtifact("plans/p2.md")]);
		const rows: WorkflowStage[] = [
			{
				session: { id: "sess-plan", file: "/runs/plan.jsonl" },
				stageNumber: 1,
				stage: "plan",
				skill: "plan",
				status: "completed",
				ts: "t1",
				output: out1,
			},
			{
				session: { id: "sess-build", file: "/runs/build.jsonl" },
				stageNumber: 2,
				stage: "build",
				skill: "build",
				status: "completed",
				ts: "t2",
				output: out2,
			},
		];

		const result = await foldTrail({ rows, stopBefore: new Map() }, FOLD_CTX, linearWorkflow);
		expect(result.ok).toBe(true);
		if (!result.ok) return; // type narrow

		// The MOST RECENT completed single stage's session rolls forward (build
		// overwrites plan) — what a downstream `continue` stage forks after a
		// resume, byte-identical to the live `recordStageSuccess` single-stage branch.
		expect(result.state.lastSession).toEqual({ id: "sess-build", file: "/runs/build.jsonl" });
	});

	it("a session:null row (script stage) does NOT clobber lastSession on resume (F2 replay parity)", async () => {
		const out1 = fakeOutput([fakeArtifact("plans/p1.md")]);
		const sideOut = fakeOutput([]); // script/side-effect output, no artifacts
		const rows: WorkflowStage[] = [
			{
				session: { id: "sess-plan", file: "/runs/plan.jsonl" },
				stageNumber: 1,
				stage: "plan",
				skill: "plan",
				status: "completed",
				ts: "t1",
				output: out1,
			},
			{
				// Script/side-effect stages persist `session: null` and the LIVE path
				// never touches `lastSession` — so the fold must leave it untouched too.
				session: null,
				stageNumber: 2,
				stage: "commit",
				skill: "commit",
				status: "completed",
				ts: "t2",
				output: sideOut,
			},
		];

		const result = await foldTrail({ rows, stopBefore: new Map() }, FOLD_CTX, sideEffectWorkflow);
		expect(result.ok).toBe(true);
		if (!result.ok) return; // type narrow

		// `lastSession` stays on plan's real session — a `continue` after the
		// sessionless stage forks plan on BOTH live and resume (no degrade-to-fresh).
		expect(result.state.lastSession).toEqual({ id: "sess-plan", file: "/runs/plan.jsonl" });
	});

	it("side-effect stage between produces: primary preserved, named untouched by side-effect", async () => {
		const art1 = fakeArtifact("plans/p1.md");
		const out1 = fakeOutput([art1]);
		const sideOut = fakeOutput([]); // side-effect output, no artifacts

		const rows: WorkflowStage[] = [
			{
				session: null,
				stageNumber: 1,
				stage: "plan",
				skill: "plan",
				status: "completed",
				ts: "2026-06-03T07:31:00Z",
				output: out1,
			},
			{
				session: null,
				stageNumber: 2,
				stage: "commit",
				skill: "commit",
				status: "completed",
				ts: "2026-06-03T07:32:00Z",
				output: sideOut,
			},
		];

		const result = await foldTrail({ rows, stopBefore: new Map() }, FOLD_CTX, sideEffectWorkflow);

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		// Primary stays on the produces artifact
		expect(result.state.primaryArtifact).toStrictEqual(art1);
		expect(result.state.output).toStrictEqual(sideOut);
		expect(result.state.stagesCompleted).toBe(2);
		// Side-effect stage did NOT write to named
		expect(result.state.named.plan).toEqual([out1]);
		expect(result.state.named.commit).toBeUndefined();
		expect(result.visited).toEqual(new Set(["plan", "commit"]));
	});

	it("terminal stage (inheritsArtifacts: false): clears primary", async () => {
		const art1 = fakeArtifact("plans/p1.md");
		const out1 = fakeOutput([art1]);
		const termOut = fakeOutput([]);

		const rows: WorkflowStage[] = [
			{
				session: null,
				stageNumber: 1,
				stage: "plan",
				skill: "plan",
				status: "completed",
				ts: "2026-06-03T07:31:00Z",
				output: out1,
			},
			{
				session: null,
				stageNumber: 2,
				stage: "cleanup",
				status: "completed",
				ts: "2026-06-03T07:32:00Z",
				output: termOut,
			},
		];

		const result = await foldTrail({ rows, stopBefore: new Map() }, FOLD_CTX, terminalWorkflow);

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.state.primaryArtifact).toBeUndefined();
		expect(result.state.stagesCompleted).toBe(2);
		// Named is never cleared by terminal
		expect(result.state.named.plan).toEqual([out1]);
	});

	it("failed trailing row: output NOT seeded, stagesCompleted excludes it, visited + lastStageNumber include it", async () => {
		const art1 = fakeArtifact("plans/p1.md");
		const out1 = fakeOutput([art1]);

		const rows: WorkflowStage[] = [
			{
				session: null,
				stageNumber: 1,
				stage: "plan",
				skill: "plan",
				status: "completed",
				ts: "2026-06-03T07:31:00Z",
				output: out1,
			},
			{
				session: null,
				stageNumber: 2,
				stage: "build",
				skill: "build",
				status: "failed",
				ts: "2026-06-03T07:35:00Z",
				errMsg: "Something went wrong",
			},
		];

		const result = await foldTrail({ rows, stopBefore: new Map() }, FOLD_CTX, linearWorkflow);

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		// Only the completed stage counts
		expect(result.state.stagesCompleted).toBe(1);
		// Output is from the completed row only
		expect(result.state.output).toStrictEqual(out1);
		// Primary is from the completed row only
		expect(result.state.primaryArtifact).toStrictEqual(art1);
		// lastStageNumber INCLUDES the failed row
		expect(result.lastStageNumber).toBe(2);
		expect(result.state.lastAllocatedStageNumber).toBe(2);
		// visited INCLUDES the failed row
		expect(result.visited).toEqual(new Set(["plan", "build"]));
		// named only has the completed stage
		expect(result.state.named.plan).toEqual([out1]);
		expect(result.state.named.build).toBeUndefined();
	});

	it("row whose stage is not in workflow.stages: returns stage-gone refusal", async () => {
		const rows: WorkflowStage[] = [
			{
				session: null,
				stageNumber: 1,
				stage: "plan",
				skill: "plan",
				status: "completed",
				ts: "2026-06-03T07:31:00Z",
			},
			{
				session: null,
				stageNumber: 2,
				stage: "renamed-away",
				skill: "renamed-away",
				status: "completed",
				ts: "2026-06-03T07:35:00Z",
			},
		];

		// linearWorkflow only has plan, build, deploy — no "renamed-away"
		const result = await foldTrail({ rows, stopBefore: new Map() }, FOLD_CTX, linearWorkflow);

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.reason).toBe("stage-gone");
		expect(result.detail).toBe("renamed-away");
	});

	// -------------------------------------------------------------------------
	// Loop-unit rows — keyed on the STRUCTURED `parent` field
	// -------------------------------------------------------------------------

	it("fanout generation: units publish to the named channel; generation close restores the entry primary", async () => {
		const planArt = fakeArtifact("plans/p1.md");
		const u1 = fakeArtifact("builds/b1.md");
		const u2 = fakeArtifact("builds/b2.md");
		const tail = fakeArtifact("deploys/d1.md");
		const units: FanoutFn = () => [
			{ prompt: "u1", label: "phase 1/2", id: "phase-1" },
			{ prompt: "u2", label: "phase 2/2", id: "phase-2" },
		];
		const wf: Workflow = {
			name: "test-wf",
			start: "plan",
			stages: {
				plan: produces({ outcome: makeOutcome("plans") }),
				build: produces({ outcome: makeOutcome("builds"), loop: fanout({ units }) }),
				deploy: produces({ outcome: makeOutcome("deploys") }),
			},
			edges: { plan: "build", build: "deploy", deploy: "stop" },
		} as Workflow;

		const rows: WorkflowStage[] = [
			{
				session: null,
				stageNumber: 1,
				stage: "plan",
				skill: "plan",
				status: "completed",
				ts: "t1",
				output: fakeOutput([planArt]),
			},
			fanoutUnitRow("build", "phase-1", 0, 2, fakeOutput([u1])),
			fanoutUnitRow("build", "phase-2", 1, 3, fakeOutput([u2])),
			{
				session: null,
				stageNumber: 4,
				stage: "deploy",
				skill: "deploy",
				status: "completed",
				ts: "t4",
				output: fakeOutput([tail]),
			},
		];

		const result = await foldTrail({ rows, stopBefore: new Map() }, FOLD_CTX, wf);
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		// Generation closed before deploy → primary restored to the entry (planArt),
		// then deploy rolled it forward to its own artifact.
		expect(result.state.primaryArtifact).toStrictEqual(tail);
		// Both units published into the builds channel (every unit collects).
		expect(result.state.named.builds?.map((o) => o.artifacts[0])).toEqual([u1, u2]);
		// Counters: plan + 2 units + deploy.
		expect(result.state.stagesCompleted).toBe(4);
		// Parent is visited; the decorated keys are not.
		expect(result.visited).toEqual(new Set(["plan", "build", "deploy"]));
		// Generation closed → no trailing open generation.
		expect(result.trailing).toBeUndefined();
		expect(result.drift).toBeUndefined();
	});

	it("fanout generation closed with every unit done: recorded unit tags are authoritative, no drift on a recompute mismatch", async () => {
		// The live unit source now yields a DIFFERENT roster than the trail recorded
		// (the shape a basename-keyed snapshot overwritten by a later round produces).
		const units: FanoutFn = () => [{ prompt: "x", label: "task", id: "task-1" }];
		const wf: Workflow = {
			name: "test-wf",
			start: "build",
			stages: {
				build: produces({ outcome: makeOutcome("builds"), loop: fanout({ units }) }),
				deploy: produces({ outcome: makeOutcome("deploys") }),
			},
			edges: { build: "deploy", deploy: "stop" },
		} as Workflow;
		const tail = fakeArtifact("deploys/d.md");
		const rows: WorkflowStage[] = [
			fanoutUnitRow("build", "phase-1", 0, 1, fakeOutput([fakeArtifact("builds/b1.md")])),
			{
				session: null,
				stageNumber: 2,
				stage: "deploy",
				skill: "deploy",
				status: "completed",
				ts: "t2",
				output: fakeOutput([tail]),
			},
		];

		const result = await foldTrail({ rows, stopBefore: new Map() }, FOLD_CTX, wf);
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		// The generation was closed by the deploy row with its one unit completed:
		// the recorded tag stands in for the recompute and the fold does not drift.
		expect(result.drift).toBeUndefined();
		expect(result.state.stagesCompleted).toBe(2);
		expect(result.trailing).toBeUndefined();
	});

	it("fanout drift: a recomputed unit id differs from a recorded row → ok with drift set, state still applied", async () => {
		const units: FanoutFn = () => [{ prompt: "x", label: "task", id: "task-1" }];
		const wf: Workflow = {
			name: "test-wf",
			start: "build",
			stages: { build: produces({ outcome: makeOutcome("builds"), loop: fanout({ units }) }) },
			edges: { build: "stop" },
		} as Workflow;

		const rows: WorkflowStage[] = [
			fanoutUnitRow("build", "phase-1", 0, 1, fakeOutput([fakeArtifact("builds/b1.md")])),
		];

		const result = await foldTrail({ rows, stopBefore: new Map() }, FOLD_CTX, wf);
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		// Drift recorded against the parent; the fold still applied the row so state is complete.
		expect(result.drift?.parent).toBe("build");
		expect(result.drift?.errMsg).toMatch(/deterministic/);
		expect(result.state.stagesCompleted).toBe(1);
	});

	it("legacy decorated row without `parent` refuses stage-gone (older run shape, no migration)", async () => {
		const rows: WorkflowStage[] = [
			{ session: null, stageNumber: 1, stage: "build (phase 1/2)", skill: "build", status: "completed", ts: "t1" },
		];

		const result = await foldTrail({ rows, stopBefore: new Map() }, FOLD_CTX, linearWorkflow);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.reason).toBe("stage-gone");
		expect(result.detail).toBe("build (phase 1/2)");
	});

	it("iterate generation: rolls the primary forward; trailing open generation carries the accumulated cursor", async () => {
		const reviewArt = fakeArtifact("reviews/r1.md");
		const p1 = fakeArtifact("plans/p1.md");
		const p2 = fakeArtifact("plans/p2.md");
		const next: IterateFn = ({ index }) =>
			index >= 2 ? null : { prompt: `p${index + 1}`, label: `phase ${index + 1}`, id: `phase-${index + 1}` };
		const wf: Workflow = {
			name: "test-wf",
			start: "review",
			stages: {
				review: produces({ outcome: makeOutcome("reviews") }),
				blueprint: produces({ outcome: makeOutcome("plans"), loop: iterate({ next }) }),
			},
			edges: { review: "blueprint", blueprint: "stop" },
		} as Workflow;

		const rows: WorkflowStage[] = [
			{
				session: null,
				stageNumber: 1,
				stage: "review",
				skill: "review",
				status: "completed",
				ts: "t1",
				output: fakeOutput([reviewArt]),
			},
			fanoutUnitRow("blueprint", "phase-1", 0, 2, fakeOutput([p1])),
			fanoutUnitRow("blueprint", "phase-2", 1, 3, fakeOutput([p2])),
		];

		const result = await foldTrail({ rows, stopBefore: new Map() }, FOLD_CTX, wf);
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		// Primary rolled forward to the last unit (iterate units roll, unlike fanout).
		expect(result.state.primaryArtifact).toStrictEqual(p2);
		expect(result.state.named.plans?.map((o) => o.artifacts[0])).toEqual([p1, p2]);
		expect(result.visited).toEqual(new Set(["review", "blueprint"]));
		// Trailing open generation carries the reconstructed driver cursor + FROZEN entry.
		expect(result.trailing?.parent).toBe("blueprint");
		expect(result.trailing?.cursor.index).toBe(2);
		expect(result.trailing?.cursor.accumulated.map((o) => o.artifacts[0])).toEqual([p1, p2]);
		expect(result.trailing?.entryArtifact).toStrictEqual(reviewArt);
		expect(result.drift).toBeUndefined();
	});

	it("assess generation: producer + judge rows publish to separate channels; close restores the last producer pair", async () => {
		const p0 = fakeArtifact("tasks/t0.md");
		const v0 = fakeArtifact("verdicts/v0.json");
		const p1 = fakeArtifact("tasks/t1.md");
		const v1 = fakeArtifact("verdicts/v1.json");
		const g1 = fakeArtifact("gates/g1.md");
		const loop = assess({
			judge: judge({ skill: "grade", outcome: makeOutcome("verdict") }),
			done: () => false,
			feedForward: () => "more",
		});
		const wf: Workflow = {
			name: "test-wf",
			start: "breakdown",
			stages: {
				breakdown: produces({ outcome: makeOutcome("tasks"), loop }),
				gate: produces({ outcome: makeOutcome("gates") }),
			},
			edges: { breakdown: "gate", gate: "stop" },
		} as Workflow;

		const rows: WorkflowStage[] = [
			assessProduceRow("breakdown", 0, 1, fakeOutput([p0])),
			assessJudgeRow("breakdown", "grade", 0, 2, fakeOutput([v0])),
			assessProduceRow("breakdown", 1, 3, fakeOutput([p1])),
			assessJudgeRow("breakdown", "grade", 1, 4, fakeOutput([v1])),
			{
				session: null,
				stageNumber: 5,
				stage: "gate",
				skill: "gate",
				status: "completed",
				ts: "t5",
				output: fakeOutput([g1]),
			},
		];

		const result = await foldTrail({ rows, stopBefore: new Map() }, FOLD_CTX, wf);
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		// Producers and verdicts live in distinct named channels.
		expect(result.state.named.tasks?.map((o) => o.artifacts[0])).toEqual([p0, p1]);
		expect(result.state.named.verdict?.map((o) => o.artifacts[0])).toEqual([v0, v1]);
		// Generation closed before gate → "last" projects the last producer (p1), THEN gate rolled it.
		expect(result.state.primaryArtifact).toStrictEqual(g1);
		// Every completed row of either phase bumped the counter (2 produce + 2 judge + gate).
		expect(result.state.stagesCompleted).toBe(5);
		expect(result.visited).toEqual(new Set(["breakdown", "gate"]));
		expect(result.trailing).toBeUndefined();
		expect(result.drift).toBeUndefined();
	});

	it("assess × panel: each member verdict publishes to its OWN channel; the fold publishes to `<stage>-panel`", async () => {
		const p0 = fakeArtifact("tasks/t0.md");
		const outA = memberVerdict("verdicts/v0a.json", true);
		const outB = memberVerdict("verdicts/v0b.json", true);
		const outC = memberVerdict("verdicts/v0c.json", false); // 2-of-3 pass → majority pass
		const loop = assess({
			judge: panel({
				members: [
					judge({ skill: "grade-a", outcome: makeOutcome("verdict-a") }),
					judge({ skill: "grade-b", outcome: makeOutcome("verdict-b") }),
					judge({ skill: "grade-c", outcome: makeOutcome("verdict-c") }),
				],
				fold: majority((v) => Boolean((v.data as { done?: boolean }).done)),
			}),
			done: (v) => Boolean((v.data as { pass?: boolean }).pass),
			feedForward: () => "more",
		});
		const wf: Workflow = {
			name: "test-wf",
			start: "breakdown",
			stages: { breakdown: produces({ outcome: makeOutcome("tasks"), loop }) },
			edges: { breakdown: "stop" },
		} as Workflow;

		const rows: WorkflowStage[] = [
			assessProduceRow("breakdown", 0, 1, fakeOutput([p0])),
			assessPanelJudgeRow("breakdown", "grade-a", 0, 0, 2, outA),
			assessPanelJudgeRow("breakdown", "grade-b", 0, 1, 3, outB),
			assessPanelJudgeRow("breakdown", "grade-c", 0, 2, 4, outC),
		];

		const result = await foldTrail({ rows, stopBefore: new Map() }, FOLD_CTX, wf);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.drift).toBeUndefined();

		// Each member rolled onto its OWN channel — the fold replays each row through
		// THAT member's def (`panelMembers[memberIndex]`), never member 0's. Pre-fix,
		// members b + c silently landed on `verdict-a`.
		expect(result.state.named["verdict-a"]).toEqual([outA]);
		expect(result.state.named["verdict-b"]).toEqual([outB]);
		expect(result.state.named["verdict-c"]).toEqual([outC]);
		// The folded verdict — recomputed-and-republished at the same transition the
		// live driver folds — is a data-only Output (no artifact) carrying the
		// canonical PANEL_VERDICT shape, on the per-stage `<stage>-panel` channel.
		const folded = result.state.named["breakdown-panel"];
		expect(folded).toHaveLength(1);
		expect(folded?.[0]?.artifacts).toEqual([]);
		expect(folded?.[0]?.data).toEqual({ pass: true, votes: { pass: 2, fail: 1 }, agreement: 2 / 3, tie: false });
	});

	it("assess × panel: a THROWING fold becomes drift (recorded terminal failure), never an unguarded rejection", async () => {
		// The fold runs the author `panel.fold` via `advanceCursor` on the LAST
		// member. It lives in `reconstructState`, which `resumeWorkflow` awaits
		// BEFORE `executeRun` brackets the lifecycle — so before the guard a throw
		// escaped as a raw promise rejection (no JSONL failure row, no
		// `onWorkflowEnd`). It must instead land as drift: this call RESOLVES
		// (ok=true, drift set) rather than rejecting.
		const p0 = fakeArtifact("tasks/t0.md");
		const outA = memberVerdict("verdicts/v0a.json", true);
		const outB = memberVerdict("verdicts/v0b.json", true);
		const outC = memberVerdict("verdicts/v0c.json", false);
		const loop = assess({
			judge: panel({
				members: [
					judge({ skill: "grade-a", outcome: makeOutcome("verdict-a") }),
					judge({ skill: "grade-b", outcome: makeOutcome("verdict-b") }),
					judge({ skill: "grade-c", outcome: makeOutcome("verdict-c") }),
				],
				// Raw fold (requires an `outcome`) that throws on the last-member fold.
				fold: () => {
					throw new Error("fold exploded");
				},
				outcome: makeOutcome("breakdown-panel"),
			}),
			done: (v) => Boolean((v.data as { pass?: boolean }).pass),
			feedForward: () => "more",
		});
		const wf: Workflow = {
			name: "test-wf",
			start: "breakdown",
			stages: { breakdown: produces({ outcome: makeOutcome("tasks"), loop }) },
			edges: { breakdown: "stop" },
		} as Workflow;

		const rows: WorkflowStage[] = [
			assessProduceRow("breakdown", 0, 1, fakeOutput([p0])),
			assessPanelJudgeRow("breakdown", "grade-a", 0, 0, 2, outA),
			assessPanelJudgeRow("breakdown", "grade-b", 0, 1, 3, outB),
			assessPanelJudgeRow("breakdown", "grade-c", 0, 2, 4, outC),
		];

		// Resolves with drift set — the fold did not reject out of reconstructState.
		const result = await foldTrail({ rows, stopBefore: new Map() }, FOLD_CTX, wf);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.drift?.parent).toBe("breakdown");
		expect(result.drift?.errMsg).toMatch(/fold exploded/);
		// State is still complete up to the throw: the last member's verdict applied
		// (on its OWN channel) BEFORE `advanceCursor` ran the throwing fold.
		expect(result.state.named["verdict-c"]).toEqual([outC]);
		// The fold never produced a value, so no folded verdict was published.
		expect(result.state.named["breakdown-panel"]).toBeUndefined();
	});

	it("REPLAY PARITY: the fold's trailing cursor is byte-equal to a live cursor advanced over the same outputs", async () => {
		// `advanceCursor` is the ONE cursor state machine; this test pins the
		// contract that the fold and the live driver advance identically. The
		// trail ends mid-assess (produce, judge, produce — generation open) so
		// the fold returns its reconstructed cursor for comparison.
		const p0 = fakeOutput([fakeArtifact("tasks/t0.md")]);
		const v0 = fakeOutput([fakeArtifact("verdicts/v0.json")]);
		const p1 = fakeOutput([fakeArtifact("tasks/t1.md")]);
		const loop = assess({
			judge: judge({ skill: "grade", outcome: makeOutcome("verdict") }),
			done: () => false,
			feedForward: () => "more",
		});
		const wf: Workflow = {
			name: "test-wf",
			start: "breakdown",
			stages: { breakdown: produces({ outcome: makeOutcome("tasks"), loop }) },
			edges: { breakdown: "stop" },
		} as Workflow;

		const rows: WorkflowStage[] = [
			assessProduceRow("breakdown", 0, 1, p0),
			assessJudgeRow("breakdown", "grade", 0, 2, v0),
			assessProduceRow("breakdown", 1, 3, p1),
		];

		const result = await foldTrail({ rows, stopBefore: new Map() }, FOLD_CTX, wf);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.drift).toBeUndefined();

		// The live driver's exact sequence for the same three completed units.
		const live = freshCursor();
		advanceCursor(live, "produce", p0, loop);
		advanceCursor(live, "judge", v0, loop);
		advanceCursor(live, "produce", p1, loop);

		expect(JSON.stringify(result.trailing?.cursor)).toBe(JSON.stringify(live));
	});

	it("assess round-0 entryArgs freeze: reconstructState yields trailing.entryArgs equal to stageEntryArgs over the state-at-generation-open (not post-fold)", async () => {
		// Pins live==resume derivation of the assess round-0 producer arg through the
		// one `freezesEntryArgsOf(loop)` authority. The `refine` stage READS its OWN
		// outcome channel (`drafts`), so each producer round APPENDS to that channel
		// — moving the `.at(-1)` cursor the reads projection consumes. The frozen
		// arg must therefore equal `stageEntryArgs` over the state reconstructed
		// from the trail BEFORE the assess generation ran (whose reads channel still
		// carries the seed entry), NOT `stageEntryArgs` over the full trail's
		// post-fold state (the hazard the
		// `resume.ts` generation-open comment warns of).
		const seedArt = fakeArtifact("drafts/seed.md");
		const r0 = fakeArtifact("drafts/r0.md");
		const v0 = fakeArtifact("verdicts/v0.json");
		const loop = assess({
			judge: judge({ skill: "grade", outcome: makeOutcome("verdict") }),
			done: () => false,
			feedForward: () => "more",
		});
		const wf: Workflow = {
			name: "test-wf",
			start: "seed",
			stages: {
				seed: produces({ outcome: makeOutcome("drafts") }),
				refine: produces({ outcome: makeOutcome("drafts"), reads: ["drafts"], loop }),
			},
			edges: { seed: "refine", refine: "stop" },
		} as Workflow;

		const seedRow: WorkflowStage = {
			session: null,
			stageNumber: 1,
			stage: "seed",
			skill: "seed",
			status: "completed",
			ts: "t1",
			output: fakeOutput([seedArt]),
		};
		const fullRows: WorkflowStage[] = [
			seedRow,
			assessProduceRow("refine", 0, 2, fakeOutput([r0])),
			assessJudgeRow("refine", "grade", 0, 3, fakeOutput([v0])),
		];

		// Full trail — generation left open (trailing), so entryArgs is frozen on it.
		const rows: WorkflowStage[] = fullRows;
		const result = await foldTrail({ rows, stopBefore: new Map() }, FOLD_CTX, wf);
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		// State-at-generation-open, as the disk test read it: the trail was written a
		// second time (append-only — nothing truncates), so the seed row sits BEHIND the
		// assess generation. The seed's entry is still the channel's latest, i.e. the
		// value the reads projection saw at generation open.
		const rewritten: WorkflowStage[] = [...fullRows, seedRow];
		const atOpen = await foldTrail({ rows: rewritten, stopBefore: new Map() }, FOLD_CTX, wf);
		expect(atOpen.ok).toBe(true);
		if (!atOpen.ok) return;

		const expected = stageEntryArgs(wf.stages.refine!, "refine", "seed", atOpen.state);
		// The frozen value is reads-derived (truthy, not just originalInput)…
		expect(expected).toBeTruthy();
		// …and matches what the fold froze at generation open.
		expect(result.trailing?.entryArgs).toBe(expected);

		// The HAZARD: re-deriving from the FULL trail's post-fold state would yield a
		// DIFFERENT arg — the generation's own appends moved the reads cursor to r0.
		// This pins WHY the freeze happens at generation open, not post-fold.
		const postFold = stageEntryArgs(wf.stages.refine!, "refine", "seed", result.state);
		expect(postFold).not.toBe(expected);
	});

	it("REPLAY PARITY: fanout trailing cursor matches the live transition", async () => {
		const u1 = fakeOutput([fakeArtifact("builds/b1.md")]);
		const units: FanoutFn = () => [
			{ prompt: "u1", label: "phase 1/2", id: "phase-1" },
			{ prompt: "u2", label: "phase 2/2", id: "phase-2" },
		];
		const loop = fanout({ units });
		const wf: Workflow = {
			name: "test-wf",
			start: "build",
			stages: { build: produces({ outcome: makeOutcome("builds"), loop }) },
			edges: { build: "stop" },
		} as Workflow;

		const rows: WorkflowStage[] = [fanoutUnitRow("build", "phase-1", 0, 1, u1)];

		const result = await foldTrail({ rows, stopBefore: new Map() }, FOLD_CTX, wf);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.drift).toBeUndefined();

		// The live fanout driver advances the cursor through `foldFanoutCompletion`
		// (place-by-index into pre-sized slots), NOT the sequential `advanceCursor` —
		// so the resume fold (which now uses the SAME authority) must match THAT, not
		// a hand-rolled sequential cursor. Throwaway state: only the cursor is compared.
		const live = freshCursor();
		foldFanoutCompletion(
			{ named: {}, primaryArtifact: undefined } as RunState,
			live,
			wf.stages.build!,
			"build",
			0,
			2,
			u1,
		);

		expect(JSON.stringify(result.trailing?.cursor)).toBe(JSON.stringify(live));
	});

	it("named slot accumulates across completed rows for the same key (append order)", async () => {
		// Simulate a backward-jump loop: plan runs twice, producing two outputs.
		const art1 = fakeArtifact("plans/p1.md");
		const art2 = fakeArtifact("plans/p2.md");
		const out1 = fakeOutput([art1]);
		const out2 = fakeOutput([art2]);

		const rows: WorkflowStage[] = [
			{
				session: null,
				stageNumber: 1,
				stage: "plan",
				skill: "plan",
				status: "completed",
				ts: "2026-06-03T07:31:00Z",
				output: out1,
			},
			{
				session: null,
				stageNumber: 2,
				stage: "plan",
				skill: "plan",
				status: "completed",
				ts: "2026-06-03T07:35:00Z",
				output: out2,
			},
		];

		const result = await foldTrail({ rows, stopBefore: new Map() }, FOLD_CTX, linearWorkflow);

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		// Primary is the latest artifact
		expect(result.state.primaryArtifact).toStrictEqual(art2);
		// Named preserves full history in order
		expect(result.state.named.plan).toEqual([out1, out2]);
		expect(result.state.stagesCompleted).toBe(2);
	});

	it("aborted row is treated like a failed row: excluded from state seeding", async () => {
		const art1 = fakeArtifact("plans/p1.md");
		const out1 = fakeOutput([art1]);

		const rows: WorkflowStage[] = [
			{
				session: null,
				stageNumber: 1,
				stage: "plan",
				skill: "plan",
				status: "completed",
				ts: "2026-06-03T07:31:00Z",
				output: out1,
			},
			{
				session: null,
				stageNumber: 2,
				stage: "build",
				skill: "build",
				status: "aborted",
				ts: "2026-06-03T07:35:00Z",
				errMsg: "User cancelled",
			},
		];

		const result = await foldTrail({ rows, stopBefore: new Map() }, FOLD_CTX, linearWorkflow);

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.state.stagesCompleted).toBe(1);
		expect(result.state.output).toStrictEqual(out1);
		expect(result.visited).toEqual(new Set(["plan", "build"]));
		expect(result.lastStageNumber).toBe(2);
	});

	it("skipped row is excluded from state seeding", async () => {
		const art1 = fakeArtifact("plans/p1.md");
		const out1 = fakeOutput([art1]);

		const rows: WorkflowStage[] = [
			{
				session: null,
				stageNumber: 1,
				stage: "plan",
				skill: "plan",
				status: "completed",
				ts: "2026-06-03T07:31:00Z",
				output: out1,
			},
			{
				session: null,
				stageNumber: 2,
				stage: "build",
				skill: "build",
				status: "skipped",
				ts: "2026-06-03T07:35:00Z",
			},
		];

		const result = await foldTrail({ rows, stopBefore: new Map() }, FOLD_CTX, linearWorkflow);

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.state.stagesCompleted).toBe(1);
		expect(result.state.output).toStrictEqual(out1);
		expect(result.visited).toEqual(new Set(["plan", "build"]));
	});

	it("lastGatedDispatch is TRANSIENT: a completed produces stage folded through reconstructState yields undefined (fresh gate on resume)", async () => {
		// The validation-redispatch baseline lives ONLY in memory — the resume
		// fold rebuilds RunState from rows, and no row carries the baseline, so a
		// resumed run starts with NO prior gate (first qualifying dispatch
		// proceeds). Matches the `lastGatedDispatch` TRANSIENT contract
		// (`packages/rpiv-workflow/types.ts:108`) and the `freshRunState` init
		// (`packages/rpiv-workflow/runner/run-context.ts:66`).
		const out1 = fakeOutput([fakeArtifact("plans/p1.md")]);
		const rows: WorkflowStage[] = [
			{
				session: null,
				stageNumber: 1,
				stage: "plan",
				skill: "plan",
				status: "completed",
				ts: "t1",
				output: out1,
			},
		];

		const result = await foldTrail({ rows, stopBefore: new Map() }, FOLD_CTX, linearWorkflow);

		expect(result.ok).toBe(true);
		if (!result.ok) return; // type narrow
		expect(result.state.lastGatedDispatch).toBeUndefined();
	});
});

describe("foldTrail — verify generations", () => {
	const pass = (v: Output) => Boolean((v.data as { done?: boolean }).done);
	const gateVerify = () => verify({ judge: judge({ skill: "grade", outcome: makeOutcome("verdict") }), done: pass });
	const retryVerify = () =>
		verify({
			judge: judge({ skill: "grade", outcome: makeOutcome("verdict") }),
			done: pass,
			feedForward: () => "again",
			max: 3,
		});

	it("closed verify generation: attempts + verdicts publish to separate channels; close restores the producer pair", async () => {
		const a0 = fakeArtifact("impl/i0.md");
		const v0 = fakeArtifact("verdicts/v0.json");
		const a1 = fakeArtifact("impl/i1.md");
		const v1 = fakeArtifact("verdicts/v1.json");
		const g1 = fakeArtifact("gates/g1.md");
		const wf: Workflow = {
			name: "test-wf",
			start: "build",
			stages: {
				build: produces({ outcome: makeOutcome("impl"), verify: retryVerify() }),
				gate: produces({ outcome: makeOutcome("gates") }),
			},
			edges: { build: "gate", gate: "stop" },
		} as Workflow;

		const rows: WorkflowStage[] = [
			verifyAttemptRow("build", 0, 1, fakeOutput([a0])),
			verifyVerdictRow("build", "grade", 0, 2, fakeOutput([v0])),
			verifyAttemptRow("build", 1, 3, fakeOutput([a1])),
			verifyVerdictRow("build", "grade", 1, 4, fakeOutput([v1])),
			{
				session: null,
				stageNumber: 5,
				stage: "gate",
				skill: "gate",
				status: "completed",
				ts: "t5",
				output: fakeOutput([g1]),
			},
		];

		const result = await foldTrail({ rows, stopBefore: new Map() }, FOLD_CTX, wf);
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.state.named.impl?.map((o) => o.artifacts[0])).toEqual([a0, a1]);
		expect(result.state.named.verdict?.map((o) => o.artifacts[0])).toEqual([v0, v1]);
		// Generation closed before gate → "last" projects the last attempt (a1), THEN gate rolled it.
		expect(result.state.primaryArtifact).toStrictEqual(g1);
		expect(result.state.stagesCompleted).toBe(5);
		expect(result.trailing).toBeUndefined();
		expect(result.drift).toBeUndefined();
	});

	it("trailing pending verify: a completed-attempt trailer reconstructs cursor phase 'judge'", async () => {
		const a0 = fakeArtifact("impl/i0.md");
		const wf: Workflow = {
			name: "test-wf",
			start: "build",
			stages: { build: produces({ outcome: makeOutcome("impl"), verify: gateVerify() }) },
			edges: { build: "stop" },
		} as Workflow;

		const rows: WorkflowStage[] = [verifyAttemptRow("build", 0, 1, fakeOutput([a0]))];

		const result = await foldTrail({ rows, stopBefore: new Map() }, FOLD_CTX, wf);
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		// The synthesized loop is recovered (no stage-gone refusal) and the
		// cursor says: attempt 0 done, verdict pending.
		expect(result.trailing?.parent).toBe("build");
		expect(result.trailing?.cursor.phase).toBe("judge");
		expect(result.trailing?.cursor.index).toBe(0);
		expect(result.trailing?.cursor.lastProduce?.artifact).toStrictEqual(a0);
		expect(result.drift).toBeUndefined();
	});

	it("role drift: a verdict row carrying role 'judge' on a verify stage trips the guard", async () => {
		const a0 = fakeArtifact("impl/i0.md");
		const v0 = fakeArtifact("verdicts/v0.json");
		const wf: Workflow = {
			name: "test-wf",
			start: "build",
			stages: { build: produces({ outcome: makeOutcome("impl"), verify: gateVerify() }) },
			edges: { build: "stop" },
		} as Workflow;

		const rows: WorkflowStage[] = [
			verifyAttemptRow("build", 0, 1, fakeOutput([a0])),
			// Wrong role for a verify stage — the driver would have emitted "verify".
			assessJudgeRow("build", "grade", 0, 2, fakeOutput([v0])),
		];

		const result = await foldTrail({ rows, stopBefore: new Map() }, FOLD_CTX, wf);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.drift?.parent).toBe("build");
	});

	it("entryArgs freeze: a reads projection is frozen at generation open (a trailing verdict's transient roll can't leak in)", async () => {
		const d0 = fakeArtifact("design/d0.md");
		const a0 = fakeArtifact("impl/i0.md");
		const v0 = fakeArtifact("verdicts/v0.json");
		const wf: Workflow = {
			name: "test-wf",
			start: "design",
			stages: {
				design: produces({ outcome: makeOutcome("design") }),
				build: produces({ outcome: makeOutcome("impl"), reads: ["design"], verify: retryVerify() }),
			},
			edges: { design: "build", build: "stop" },
		} as Workflow;

		const rows: WorkflowStage[] = [
			{
				session: null,
				stageNumber: 1,
				stage: "design",
				skill: "design",
				status: "completed",
				ts: "t1",
				output: fakeOutput([d0]),
			},
			verifyAttemptRow("build", 0, 2, fakeOutput([a0])),
			verifyVerdictRow("build", "grade", 0, 3, fakeOutput([v0])), // fail verdict — generation still open
		];

		const result = await foldTrail({ rows, stopBefore: new Map() }, FOLD_CTX, wf);
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.trailing?.entryArgs).toBe(`--design ${handleToString(d0.handle)}`);
	});

	it("truncated trail: a reads-bearing verify generation with no producer row yields entryArgs undefined", async () => {
		const a0 = fakeArtifact("impl/i0.md");
		const wf: Workflow = {
			name: "test-wf",
			start: "design",
			stages: {
				design: produces({ outcome: makeOutcome("design") }),
				build: produces({ outcome: makeOutcome("impl"), reads: ["design"], verify: gateVerify() }),
			},
			edges: { design: "build", build: "stop" },
		} as Workflow;

		// The design row is gone — only the attempt row survives.
		const rows: WorkflowStage[] = [verifyAttemptRow("build", 0, 1, fakeOutput([a0]))];

		const result = await foldTrail({ rows, stopBefore: new Map() }, FOLD_CTX, wf);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.trailing?.entryArgs).toBeUndefined();
	});
});

describe("foldTrail — lastChainIndex", () => {
	it("linear trail: one activation per row", async () => {
		const rows: WorkflowStage[] = [
			{
				session: null,
				stageNumber: 1,
				stage: "plan",
				skill: "plan",
				status: "completed",
				ts: "t1",
				output: fakeOutput(),
			},
			{ session: null, stageNumber: 2, stage: "build", skill: "build", status: "failed", ts: "t2", errMsg: "boom" },
		];

		const result = await foldTrail({ rows, stopBefore: new Map() }, FOLD_CTX, linearWorkflow);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.lastChainIndex).toBe(1);
	});

	it("a loop generation counts as ONE activation, however many unit rows it wrote", async () => {
		const units: FanoutFn = () => [
			{ prompt: "u1", label: "phase 1/3", id: "phase-1" },
			{ prompt: "u2", label: "phase 2/3", id: "phase-2" },
			{ prompt: "u3", label: "phase 3/3", id: "phase-3" },
		];
		const wf: Workflow = {
			name: "test-wf",
			start: "plan",
			stages: {
				plan: produces({ outcome: makeOutcome("plans") }),
				build: produces({ outcome: makeOutcome("builds"), loop: fanout({ units }) }),
				deploy: produces({ outcome: makeOutcome("deploys") }),
			},
			edges: { plan: "build", build: "deploy", deploy: "stop" },
		} as Workflow;

		const rows: WorkflowStage[] = [
			{
				session: null,
				stageNumber: 1,
				stage: "plan",
				skill: "plan",
				status: "completed",
				ts: "t1",
				output: fakeOutput(),
			},
			fanoutUnitRow("build", "phase-1", 0, 2, fakeOutput()),
			fanoutUnitRow("build", "phase-2", 1, 3, fakeOutput()),
			fanoutUnitRow("build", "phase-3", 2, 4, fakeOutput()),
			{
				session: null,
				stageNumber: 5,
				stage: "deploy",
				skill: "deploy",
				status: "failed",
				ts: "t5",
				errMsg: "boom",
			},
		];

		const result = await foldTrail({ rows, stopBefore: new Map() }, FOLD_CTX, wf);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		// plan(0) → build generation(1) → deploy(2). Pre-fix this was
		// `last.stageNumber - 1` = 4.
		expect(result.lastChainIndex).toBe(2);
	});

	it("a resume re-run of a failed stage keeps its activation index", async () => {
		const rows: WorkflowStage[] = [
			{
				session: null,
				stageNumber: 1,
				stage: "plan",
				skill: "plan",
				status: "completed",
				ts: "t1",
				output: fakeOutput(),
			},
			{ session: null, stageNumber: 2, stage: "build", skill: "build", status: "failed", ts: "t2", errMsg: "boom" },
			// resumed: build re-ran (same activation), then deploy failed
			{
				session: null,
				stageNumber: 3,
				stage: "build",
				skill: "build",
				status: "completed",
				ts: "t3",
				output: fakeOutput(),
			},
			{
				session: null,
				stageNumber: 4,
				stage: "deploy",
				skill: "deploy",
				status: "failed",
				ts: "t4",
				errMsg: "boom",
			},
		];

		const result = await foldTrail({ rows, stopBefore: new Map() }, FOLD_CTX, linearWorkflow);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		// plan(0) → build(1, re-run folds into the same activation) → deploy(2).
		expect(result.lastChainIndex).toBe(2);
	});

	it("a backward-jump revisit of a COMPLETED stage is a new activation", async () => {
		const rows: WorkflowStage[] = [
			{
				session: null,
				stageNumber: 1,
				stage: "plan",
				skill: "plan",
				status: "completed",
				ts: "t1",
				output: fakeOutput(),
			},
			{
				session: null,
				stageNumber: 2,
				stage: "build",
				skill: "build",
				status: "completed",
				ts: "t2",
				output: fakeOutput(),
			},
			// decision edge routed back to plan (retry loop) — distinct activation
			{
				session: null,
				stageNumber: 3,
				stage: "plan",
				skill: "plan",
				status: "completed",
				ts: "t3",
				output: fakeOutput(),
			},
		];

		const result = await foldTrail({ rows, stopBefore: new Map() }, FOLD_CTX, linearWorkflow);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.lastChainIndex).toBe(2);
	});
});

describe("foldTrail — gate-stop halts", () => {
	const completedRow = (stage: string, num: number, output: Output): WorkflowStage => ({
		session: null,
		stageNumber: num,
		stage,
		skill: stage,
		status: "completed",
		ts: `t${num}`,
		output,
	});

	it("gateStop trailer: a failed row behind a routed stop from the same stage sets gateStop; an ordinary failure does not", async () => {
		const wf: Workflow = {
			name: "test-wf",
			start: "plan",
			stages: {
				plan: { kind: "produces", sessionPolicy: "fresh" },
				check: { kind: "produces", sessionPolicy: "fresh" },
			},
			edges: { plan: "check", check: "stop" },
		} as Workflow;

		const rows: WorkflowStage[] = [
			completedRow("plan", 1, fakeOutput([fakeArtifact("plans/p1.md")])),
			completedRow("check", 2, fakeOutput()),
			gateHaltRow("check", 3),
		];
		// The routed-stop separator the strict reader records for the row it
		// precedes: the halt row (index 2), the same stage by construction.
		const stopBefore = new Map([[2, stopRow("check", 2, 'value "fail" matched no branch')]]);

		const result = await foldTrail({ rows, stopBefore }, FOLD_CTX, wf);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.gateStop?.fromStage).toBe("check");
		expect(result.gateStop?.note).toBe('value "fail" matched no branch');
		expect(result.drift).toBeUndefined();
	});

	it("no false positive: a failed trailer with no stop row behind it leaves gateStop unset", async () => {
		const wf: Workflow = {
			name: "test-wf",
			start: "plan",
			stages: {
				plan: { kind: "produces", sessionPolicy: "fresh" },
				build: { kind: "produces", sessionPolicy: "fresh" },
			},
			edges: { plan: "build", build: "stop" },
		} as Workflow;

		// No routed stop anywhere in this trail.
		const rows: WorkflowStage[] = [
			completedRow("plan", 1, fakeOutput([fakeArtifact("plans/p1.md")])),
			{ session: null, stageNumber: 2, stage: "build", status: "failed", ts: "t2", errMsg: "boom" },
		];

		const result = await foldTrail({ rows, stopBefore: new Map() }, FOLD_CTX, wf);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.gateStop).toBeUndefined();
	});

	it("fanout gate-stop: the stop separator closes+projects the generation, so the halt row is not an abort marker", async () => {
		const planArt = fakeArtifact("plans/p1.md");
		const u1 = fakeArtifact("verdicts/v1.json");
		const u2 = fakeArtifact("verdicts/v2.json");
		const units: FanoutFn = () => [
			{ prompt: "d1", label: "dim 1/2", id: "dim-1" },
			{ prompt: "d2", label: "dim 2/2", id: "dim-2" },
		];
		const wf: Workflow = {
			name: "test-wf",
			start: "plan",
			stages: {
				plan: { kind: "produces", sessionPolicy: "fresh" },
				grade: produces({ outcome: makeOutcome("verdicts"), loop: fanout({ units }) }),
			},
			edges: { plan: "grade", grade: "stop" },
		} as Workflow;

		const rows: WorkflowStage[] = [
			completedRow("plan", 1, fakeOutput([planArt])),
			fanoutUnitRow("grade", "dim-1", 0, 2, fakeOutput([u1])),
			fanoutUnitRow("grade", "dim-2", 1, 3, fakeOutput([u2])),
			gateHaltRow("grade", 4),
		];
		// The separator sits before the halt row (index 3) — it closes the generation
		// before that row folds.
		const stopBefore = new Map([[3, stopRow("grade", 3, "completeness failed (medium)")]]);

		const result = await foldTrail({ rows, stopBefore }, FOLD_CTX, wf);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		// The generation closed AT the separator — projection restored the entry
		// primary (the live driver had projected before its route fired) — so no
		// trailing open generation survives for the entry selector to re-enter.
		expect(result.trailing).toBeUndefined();
		expect(result.state.primaryArtifact).toStrictEqual(planArt);
		expect(result.state.named.verdicts?.map((o) => o.artifacts[0])).toEqual([u1, u2]);
		expect(result.gateStop?.fromStage).toBe("grade");
		expect(result.drift).toBeUndefined();
	});

	it("post-resume trail: two same-parent generations split only by the stop pair fold separately, without drift", async () => {
		const planArt = fakeArtifact("plans/p1.md");
		const outs = [1, 2, 3, 4].map((n) => fakeArtifact(`verdicts/v${n}.json`));
		const units: FanoutFn = () => [
			{ prompt: "d1", label: "dim 1/2", id: "dim-1" },
			{ prompt: "d2", label: "dim 2/2", id: "dim-2" },
		];
		const wf: Workflow = {
			name: "test-wf",
			start: "plan",
			stages: {
				plan: { kind: "produces", sessionPolicy: "fresh" },
				grade: produces({ outcome: makeOutcome("verdicts"), loop: fanout({ units }) }),
			},
			edges: { plan: "grade", grade: "stop" },
		} as Workflow;

		const rows: WorkflowStage[] = [
			completedRow("plan", 1, fakeOutput([planArt])),
			// Generation 1 (halted by the gate), the stop pair, then the fresh
			// generation a stop-resume re-dispatch appended for the SAME parent.
			// Without the separator these four unit rows would mis-fold as one
			// generation (repeated unitIndex 0 → drift).
			fanoutUnitRow("grade", "dim-1", 0, 2, fakeOutput([outs[0]!])),
			fanoutUnitRow("grade", "dim-2", 1, 3, fakeOutput([outs[1]!])),
			gateHaltRow("grade", 4),
			fanoutUnitRow("grade", "dim-1", 0, 5, fakeOutput([outs[2]!])),
			fanoutUnitRow("grade", "dim-2", 1, 6, fakeOutput([outs[3]!])),
		];
		// The separator before index 3 — the halt row — splits the two same-parent
		// generations the trail would otherwise fold as one.
		const stopBefore = new Map([[3, stopRow("grade", 3, "completeness failed (medium)")]]);

		const result = await foldTrail({ rows, stopBefore }, FOLD_CTX, wf);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.drift).toBeUndefined();
		// The fresh generation replaced the halted one on the channel — the live
		// `placeFanoutOutput` semantics (index-addressed, latest generation wins).
		expect(result.state.named.verdicts?.map((o) => o.artifacts[0])).toEqual([outs[2], outs[3]]);
		// The SECOND generation is the trailing open one (its route never fired).
		expect(result.trailing?.parent).toBe("grade");
		// A completed unit-row trailer is not a gate-stop halt.
		expect(result.gateStop).toBeUndefined();
	});
});
