/**
 * Disk-half + integration tests for resuming a run: the `reconstructState`
 * entry point (schema-version gate → strict read → delegate) and the
 * `resumeWorkflow` drives that write real JSONL and read it back.
 *
 * Covers:
 *   1. The reader/gate contract — empty file → no-rows refusal; a
 *      stage-shaped row that fails the deep guard, a row without session
 *      provenance, and any pre-v3 header all REFUSE rather than mis-replay
 *   2. Gate-stop halts end-to-end — the re-measure resume entries (produces
 *      gate re-runs; side-effect gate dispatches onward). The separator /
 *      `gateStop` fold semantics themselves live in `resume-fold.test.ts`
 *   3. `resumeWorkflow` — failed/completed trailers, no-op vs re-attempt,
 *      append-only numbering, fresh per-invocation budgets
 *
 * What the ROWS mean — state transitions, loop generations, chain indices,
 * the fold's own refusals and trailers — is asserted against LITERAL trails in
 * `resume-fold.test.ts`, which drives `foldTrail` directly. End-to-end
 * loop-resume DISPATCH (re-run failed+remaining units, finished no-op silence,
 * the assess pending paths, back-edge generation reset) lives in
 * `resume-loop.test.ts`.
 */

import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMockSessionChain, mockAssistantMessage } from "@hs1n/rpiv-test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acts, defineRoute, type EdgeFn, match, produces, setRouteNote, type Workflow } from "../api.js";
import type { Artifact } from "../handle.js";
import { fs as fsHandle, opaque } from "../handle.js";
import { FAIL_GATE_STOP } from "../messages.js";
import type { Output } from "../output.js";
import {
	appendHeader,
	appendRoutingDecision,
	appendStage,
	type RoutingDecision,
	readAllStages,
	readHeader,
	STATE_SCHEMA_VERSION,
	stateFilePath,
	type WorkflowHeader,
	type WorkflowStage,
} from "../state/index.js";
import { reconstructState } from "./resume.js";
import { resumeWorkflow, runWorkflow } from "./runner.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const fakeArtifact = (path: string): Artifact => ({ handle: fsHandle(path), role: "primary" });

const fakeOutput = (artifacts: readonly Artifact[] = []): Output => ({
	kind: "artifacts",
	artifacts,
	data: {},
	meta: { stage: "test", stageNumber: 1, ts: "", runId: "" },
});

/**
 * Minimal named outcome for fold tests. The collector is never invoked — the
 * reconstruct fold replays persisted rows, not live sessions — so a stub that
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

const baseHeader: WorkflowHeader = {
	runId: "2026-06-03_07-30-00-ab12",
	workflow: "test-wf",
	input: "Add dark mode",
	ts: "2026-06-03T07:30:00Z",
	v: STATE_SCHEMA_VERSION,
};

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeEach(() => {
	tmpDir = mkdtempSync(join(tmpdir(), "rpiv-workflow-resume-"));
});

afterEach(() => {
	rmSync(tmpDir, { recursive: true, force: true });
});

function writeRunStages(stages: WorkflowStage[]): WorkflowHeader {
	appendHeader(tmpDir, baseHeader);
	for (const stage of stages) {
		appendStage(tmpDir, baseHeader.runId, stage);
	}
	return baseHeader;
}

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

describe("reconstructState", () => {
	it("empty file (no stage rows): returns no-rows refusal", async () => {
		// Write header only, no stage rows
		appendHeader(tmpDir, baseHeader);

		const result = await reconstructState(tmpDir, linearWorkflow, baseHeader);

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.reason).toBe("no-rows");
		expect(result.detail).toBe(baseHeader.runId);
	});

	it("REFUSES (malformed-row) instead of skipping a stage-shaped row that fails the deep guard", async () => {
		// Fault injection: the trail's failure row lost its valid `status` (torn
		// write, foreign writer). Pre-fix the shallow guard skipped it and the
		// fold replayed the run as if `build` never ran — a resume would route
		// onward past the stage that actually failed.
		writeRunStages([
			{
				session: null,
				stageNumber: 1,
				stage: "plan",
				skill: "plan",
				status: "completed",
				ts: "t1",
				output: fakeOutput(),
			},
		]);
		appendFileSync(
			stateFilePath(tmpDir, baseHeader.runId),
			`${JSON.stringify({ stageNumber: 2, stage: "build", skill: "build", status: "exploded", ts: "t2" })}\n`,
			"utf-8",
		);

		const result = await reconstructState(tmpDir, linearWorkflow, baseHeader);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.reason).toBe("malformed-row");
		expect(result.detail).toContain('stage row 2 ("build")');
	});

	it("REFUSES (malformed-row) a pre-session-provenance row — no `session` key", async () => {
		// A dev-local file written before session provenance landed: stage rows
		// carry no `session` key. v1 never shipped, so the shape was redefined
		// in place — the strict guard refuses; the remedy is wiping
		// `.rpiv/workflows/runs/`.
		writeRunStages([
			{
				session: null,
				stageNumber: 1,
				stage: "plan",
				skill: "plan",
				status: "completed",
				ts: "t1",
				output: fakeOutput(),
			},
		]);
		appendFileSync(
			stateFilePath(tmpDir, baseHeader.runId),
			`${JSON.stringify({ stageNumber: 2, stage: "build", skill: "build", status: "failed", ts: "t2", errMsg: "x" })}\n`,
			"utf-8",
		);

		const result = await reconstructState(tmpDir, linearWorkflow, baseHeader);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.reason).toBe("malformed-row");
		expect(result.detail).toContain('stage row 2 ("build")');
	});

	it("REFUSES (version-mismatch) a header written under an unknown schema version", async () => {
		writeRunStages([
			{
				session: null,
				stageNumber: 1,
				stage: "plan",
				skill: "plan",
				status: "completed",
				ts: "t1",
				output: fakeOutput(),
			},
		]);

		const result = await reconstructState(tmpDir, linearWorkflow, { ...baseHeader, v: 99 });
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.reason).toBe("version-mismatch");
		expect(result.detail).toContain("schema v99");
	});

	it("REFUSES v1 (absent or explicit) and v2 trails with version-mismatch (schema v3)", async () => {
		// Under schema v3 the fold places completion rows by `unitIndex` and
		// skips under-budget collected rows budget-aware; a v1
		// (sequential) trail cannot replay under the new rules, so it is rejected
		// cleanly ("start a fresh run") rather than mis-folded. An absent `v`
		// resolves to 1 and is rejected identically.
		writeRunStages([
			{
				session: null,
				stageNumber: 1,
				stage: "plan",
				skill: "plan",
				status: "completed",
				ts: "t1",
				output: fakeOutput(),
			},
		]);

		// An absent `v` resolves to version 1.
		const { v: _omit, ...absentHeader } = baseHeader;
		const absent = await reconstructState(tmpDir, linearWorkflow, absentHeader);
		expect(absent.ok).toBe(false);
		if (absent.ok) return;
		expect(absent.reason).toBe("version-mismatch");

		// An explicit v: 1 is rejected identically.
		const explicit = await reconstructState(tmpDir, linearWorkflow, { ...baseHeader, v: 1 });
		expect(explicit.ok).toBe(false);
		if (explicit.ok) return;
		expect(explicit.reason).toBe("version-mismatch");

		// A v2 (pre-ordinal parallel-fanout) trail — the live upgrade path — is rejected too.
		const v2 = await reconstructState(tmpDir, linearWorkflow, { ...baseHeader, v: 2 });
		expect(v2.ok).toBe(false);
		if (v2.ok) return;
		expect(v2.reason).toBe("version-mismatch");
	});
});

// ---------------------------------------------------------------------------
// resumeWorkflow — end-to-end resume tests
// ---------------------------------------------------------------------------

// Tempered in lockstep with rpiv-pi's production pattern (2136ef72): the class
// refuses ".." in any segment so a prose-ellipsis path never collects.
const RPIV_ARTIFACT_PATTERN = /\.rpiv\/artifacts\/(?:(?!\.\.)[\w.-])+\/(?:(?!\.\.)[\w.-])+\.md/g;

/** Minimal outcome that scans assistant text for .rpiv/artifacts paths. */
const artifactOutcome: import("../output-spec.js").Outcome<unknown, "artifact-md", Record<string, unknown>> = {
	collector: {
		collect: (ctx) => {
			let lastMatch: string | undefined;
			const start = Math.max(ctx.branchOffset ?? 0, 0);
			for (let i = ctx.branch.length - 1; i >= start && !lastMatch; i--) {
				const entry = ctx.branch[i]!;
				if (entry.type !== "message" || entry.message?.role !== "assistant") continue;
				const content = entry.message.content;
				if (!Array.isArray(content)) continue;
				for (let j = content.length - 1; j >= 0; j--) {
					const part = content[j]!;
					if (part.type === "text" && typeof part.text === "string") {
						const matches = part.text.match(RPIV_ARTIFACT_PATTERN);
						if (matches && matches.length > 0) {
							lastMatch = matches[matches.length - 1];
							break;
						}
					}
				}
			}
			if (!lastMatch) {
				return {
					kind: "fatal",
					message: `${ctx.skill} finished without producing a .rpiv/artifacts path`,
				};
			}
			return { kind: "ok", artifacts: [{ handle: fsHandle(lastMatch), role: "primary" }] };
		},
	},
};

/** Build a minimal 2-stage produces workflow for resume tests. */
const twoStageWf: Workflow = {
	name: "resume-wf",
	start: "plan",
	stages: {
		plan: { kind: "produces", sessionPolicy: "fresh", outcome: artifactOutcome },
		build: { kind: "produces", sessionPolicy: "fresh", outcome: artifactOutcome },
	},
	edges: {
		plan: "build",
		build: "stop",
	},
};

const resumeHeader: WorkflowHeader = {
	runId: "2026-06-03_07-30-00-ab12",
	workflow: "resume-wf",
	input: "Add dark mode",
	ts: "2026-06-03T07:30:00Z",
	v: STATE_SCHEMA_VERSION,
};

describe("resumeWorkflow", () => {
	/** Helper: write header + stages, return the header. */
	function writeRun(header: WorkflowHeader, stages: WorkflowStage[]): void {
		appendHeader(tmpDir, header);
		for (const stage of stages) {
			appendStage(tmpDir, header.runId, stage);
		}
	}

	/** Helper: read all stage rows from the run's JSONL. */
	function readRunStages(runId: string): WorkflowStage[] {
		return readAllStages(tmpDir, runId);
	}

	/** Write an artifact file at the given relative path under tmpDir. */
	function writeArtifact(relPath: string, content = "") {
		const parts = relPath.split("/");
		const dir = join(tmpDir, ...parts.slice(0, -1));
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(tmpDir, relPath), content);
	}

	it("failed-trailer: re-runs the failed stage and continues to completion", async () => {
		// Stage 1 completed, stage 2 failed.
		// Resume should re-run stage 2 and complete.
		const art1 = fakeArtifact("plans/p1.md");
		const out1 = fakeOutput([art1]);

		writeRun(resumeHeader, [
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
		]);

		writeArtifact(".rpiv/artifacts/builds/b1.md");
		const chain = createMockSessionChain({
			cwd: tmpDir,
			steps: [{ branch: [mockAssistantMessage("Wrote .rpiv/artifacts/builds/b1.md")] }],
		});

		const result = await resumeWorkflow(chain.ctx, {
			workflow: twoStageWf,
			header: resumeHeader,
			ref: "@2026-06-03_07-30-00-ab12",
		});

		expect(result.success).toBe(true);
		expect(result.runId).toBe(resumeHeader.runId);
		// 1 (original plan) + 1 (re-ran build) = 2
		expect(result.stagesCompleted).toBe(2);
		expect(result.lastArtifact).toBe(".rpiv/artifacts/builds/b1.md");

		// JSONL should have: original header + plan(completed) + build(failed) + build(completed)
		const stages = readRunStages(resumeHeader.runId);
		expect(stages).toHaveLength(3); // 2 original + 1 new
		expect(stages[2]).toMatchObject({
			stage: "build",
			status: "completed",
		});
		// New stage number is strictly greater than the failed row's number
		expect(stages[2]!.stageNumber).toBeGreaterThan(stages[1]!.stageNumber);

		// Dispatched the re-run with the prior stage's artifact as input
		expect(chain.sentMessages).toEqual(["/skill:build plans/p1.md"]);
	});

	it("completed-trailer: routes onward from the last completed stage", async () => {
		// Stage 1 completed. The last row is completed,
		// so resume should route onward to stage 2.
		const art1 = fakeArtifact("plans/p1.md");
		const out1 = fakeOutput([art1]);

		writeRun(resumeHeader, [
			{
				session: null,
				stageNumber: 1,
				stage: "plan",
				skill: "plan",
				status: "completed",
				ts: "2026-06-03T07:31:00Z",
				output: out1,
			},
		]);

		writeArtifact(".rpiv/artifacts/builds/b1.md");
		const chain = createMockSessionChain({
			cwd: tmpDir,
			steps: [{ branch: [mockAssistantMessage("Wrote .rpiv/artifacts/builds/b1.md")] }],
		});

		const result = await resumeWorkflow(chain.ctx, {
			workflow: twoStageWf,
			header: resumeHeader,
			ref: "@2026-06-03_07-30-00-ab12",
		});

		expect(result.success).toBe(true);
		expect(result.stagesCompleted).toBe(2);

		const stages = readRunStages(resumeHeader.runId);
		expect(stages).toHaveLength(2); // 1 original + 1 new (build)
		expect(stages[1]).toMatchObject({ stage: "build", status: "completed" });
		expect(stages[1]!.stageNumber).toBeGreaterThan(stages[0]!.stageNumber);

		expect(chain.sentMessages).toEqual(["/skill:build plans/p1.md"]);
	});

	it("c2 contract: resuming a completed run is a clean no-op (stagesCompleted unchanged)", async () => {
		// Both stages completed, edge is "stop". Resuming routes onward from build,
		// which hits stop → finalizeWorkflow → success. No new stage rows.
		const art1 = fakeArtifact("plans/p1.md");
		const art2 = fakeArtifact("builds/b1.md");
		const out1 = fakeOutput([art1]);
		const out2 = fakeOutput([art2]);

		writeRun(resumeHeader, [
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
		]);

		const chain = createMockSessionChain({ cwd: tmpDir, steps: [] });

		// Lifecycle capture (same pattern as the "stamps resumedFrom in trigger.meta"
		// test): the clean no-op runs the normal bracket — onWorkflowStart +
		// onWorkflowEnd fire once each — but dispatches NOTHING in between, so
		// onStageStart must never fire.
		const started = { workflow: 0, stage: 0 };
		let endStatus: string | undefined;
		const result = await resumeWorkflow(chain.ctx, {
			workflow: twoStageWf,
			header: resumeHeader,
			ref: "@2026-06-03_07-30-00-ab12",
			lifecycle: {
				onWorkflowStart: () => {
					started.workflow++;
				},
				onStageStart: () => {
					started.stage++;
				},
				onWorkflowEnd: (res) => {
					endStatus = res.termination?.status;
				},
			},
		});

		expect(result.success).toBe(true);
		expect(result.stagesCompleted).toBe(2); // unchanged
		expect(result.lastArtifact).toBe("builds/b1.md");

		// No new stage rows appended
		const stages = readRunStages(resumeHeader.runId);
		expect(stages).toHaveLength(2);

		// No new session was spawned
		expect(chain.ctx.spawnChild).not.toHaveBeenCalled();

		// Clean no-op bracket: start + end fire exactly once, terminated
		// "completed", and NO stage session was dispatched in between.
		expect(started.workflow).toBe(1);
		expect(started.stage).toBe(0);
		expect(endStatus).toBe("completed");
	});

	it("c2 boundary: a failed trailer intentionally re-attempts the stage (NOT a no-op)", async () => {
		// Boundary counterpart to the completed no-op above. The failed/aborted
		// trailer branch in resume-entry.ts deliberately re-runs the stage — resume's
		// retry purpose — so it is OUTSIDE c2's no-op guarantee. The full behavior
		// (re-run + continuation) lives in the "failed-trailer" test; the completed
		// onward-continuation lives in "completed-trailer". This test pins only the
		// boundary contract so the completed-vs-failed contrast sits in one place
		// and a future reader does not "fix" the intentional retry.
		const art1 = fakeArtifact("plans/p1.md");
		const out1 = fakeOutput([art1]);

		writeRun(resumeHeader, [
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
		]);

		writeArtifact(".rpiv/artifacts/builds/b1.md");
		const chain = createMockSessionChain({
			cwd: tmpDir,
			steps: [{ branch: [mockAssistantMessage("Wrote .rpiv/artifacts/builds/b1.md")] }],
		});

		const result = await resumeWorkflow(chain.ctx, {
			workflow: twoStageWf,
			header: resumeHeader,
			ref: "@2026-06-03_07-30-00-ab12",
		});

		// NOT a no-op: a new stage row IS appended and the failed stage re-runs.
		expect(result.success).toBe(true);
		const stages = readRunStages(resumeHeader.runId);
		expect(stages).toHaveLength(3); // 2 original + 1 re-run
		expect(stages[2]).toMatchObject({ stage: "build", status: "completed" });
		expect(chain.sentMessages).toEqual(["/skill:build plans/p1.md"]);
	});

	it("no-rows refusal: returns error envelope, no self-notify (caller surfaces it)", async () => {
		// Header-only file (no stage rows)
		appendHeader(tmpDir, resumeHeader);

		const chain = createMockSessionChain({ cwd: tmpDir, steps: [] });

		const result = await resumeWorkflow(chain.ctx, {
			workflow: twoStageWf,
			header: resumeHeader,
			ref: "@2026-06-03_07-30-00-ab12",
		});

		expect(result.success).toBe(false);
		expect(result.error).toMatch(/no recorded stages/);
		expect(result.stagesCompleted).toBe(0);
		// No runId on a no-JSONL refusal — the discriminator command uses to decide
		// whether to notify (the stage machinery never wrote a failure row here).
		expect(result.runId).toBeUndefined();

		// Pure envelope: resumeWorkflow does NOT self-notify (mirrors runWorkflow's
		// pre-flight rejections). The caller surfaces result.error.
		const errorNotifies = chain.notifications.filter((n) => n.level === "error" && /no recorded stages/.test(n.msg));
		expect(errorNotifies).toHaveLength(0);

		// No new JSONL rows written on refusal
		const stages = readRunStages(resumeHeader.runId);
		expect(stages).toHaveLength(0);
	});

	it("stage-gone refusal: returns error envelope, no self-notify", async () => {
		writeRun(resumeHeader, [
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
				stage: "removed-stage",
				skill: "removed-stage",
				status: "failed",
				ts: "2026-06-03T07:35:00Z",
				errMsg: "fail",
			},
		]);

		const chain = createMockSessionChain({ cwd: tmpDir, steps: [] });

		const result = await resumeWorkflow(chain.ctx, {
			workflow: twoStageWf,
			header: resumeHeader,
			ref: "@2026-06-03_07-30-00-ab12",
		});

		expect(result.success).toBe(false);
		expect(result.error).toMatch(/no longer exists/);
		expect(result.runId).toBeUndefined();

		const errorNotifies = chain.notifications.filter((n) => n.level === "error" && /no longer exists/.test(n.msg));
		expect(errorNotifies).toHaveLength(0);
	});

	it("resume does not write a new header (append-only)", async () => {
		// Write a completed run, then resume it. The JSONL should have exactly
		// one header line (the original) — no second header was appended.
		const art1 = fakeArtifact("plans/p1.md");
		const out1 = fakeOutput([art1]);

		writeRun(resumeHeader, [
			{
				session: null,
				stageNumber: 1,
				stage: "plan",
				skill: "plan",
				status: "completed",
				ts: "2026-06-03T07:31:00Z",
				output: out1,
			},
		]);

		writeArtifact(".rpiv/artifacts/builds/b1.md");
		const chain = createMockSessionChain({
			cwd: tmpDir,
			steps: [{ branch: [mockAssistantMessage("Wrote .rpiv/artifacts/builds/b1.md")] }],
		});

		await resumeWorkflow(chain.ctx, {
			workflow: twoStageWf,
			header: resumeHeader,
			ref: "@2026-06-03_07-30-00-ab12",
		});

		// Read raw file and count header lines (lines with runId + workflow but no stageNumber)
		const content = readFileSync(stateFilePath(tmpDir, resumeHeader.runId), "utf-8");
		const lines = content.trim().split("\n");
		const headerLines = lines.filter((l) => {
			try {
				const p = JSON.parse(l);
				return typeof p.runId === "string" && typeof p.stageNumber !== "number";
			} catch {
				return false;
			}
		});
		expect(headerLines).toHaveLength(1);
	});

	it("new stage numbers are strictly greater than all prior stage numbers", async () => {
		const art1 = fakeArtifact("plans/p1.md");
		const out1 = fakeOutput([art1]);

		writeRun(resumeHeader, [
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
				errMsg: "fail",
			},
		]);

		writeArtifact(".rpiv/artifacts/builds/b1.md");
		const chain = createMockSessionChain({
			cwd: tmpDir,
			steps: [{ branch: [mockAssistantMessage("Wrote .rpiv/artifacts/builds/b1.md")] }],
		});

		await resumeWorkflow(chain.ctx, {
			workflow: twoStageWf,
			header: resumeHeader,
			ref: "@2026-06-03_07-30-00-ab12",
		});

		const stages = readRunStages(resumeHeader.runId);
		const maxOriginal = Math.max(...stages.slice(0, 2).map((s) => s.stageNumber));
		const newStages = stages.slice(2);
		for (const s of newStages) {
			expect(s.stageNumber).toBeGreaterThan(maxOriginal);
		}
	});

	it("stamps resumedFrom in trigger.meta", async () => {
		const art1 = fakeArtifact("plans/p1.md");
		const out1 = fakeOutput([art1]);

		writeRun(resumeHeader, [
			{
				session: null,
				stageNumber: 1,
				stage: "plan",
				skill: "plan",
				status: "completed",
				ts: "2026-06-03T07:31:00Z",
				output: out1,
			},
		]);

		writeArtifact(".rpiv/artifacts/builds/b1.md");
		const chain = createMockSessionChain({
			cwd: tmpDir,
			steps: [{ branch: [mockAssistantMessage("Wrote .rpiv/artifacts/builds/b1.md")] }],
		});

		// Use lifecycle listeners to capture the trigger from LifecycleContext
		const capturedTriggers: unknown[] = [];
		await resumeWorkflow(chain.ctx, {
			workflow: twoStageWf,
			header: resumeHeader,
			ref: "@my-run-ref",
			lifecycle: {
				onWorkflowStart: (lc) => {
					capturedTriggers.push(lc.trigger);
				},
			},
		});

		expect(capturedTriggers).toHaveLength(1);
		expect(capturedTriggers[0]).toMatchObject({
			kind: "command",
			name: "wf",
			meta: { resumedFrom: "@my-run-ref" },
		});
	});

	// Mid-loop resume dispatch (fanout/iterate/assess) is covered end-to-end in `resume-loop.test.ts`.
});

// ---------------------------------------------------------------------------
// Gate-stop halts — the [routed stop row, FAIL_GATE_STOP row] pair a noted
// decision stop leaves at the trail's tail, and the resume paths over it.
// ---------------------------------------------------------------------------

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

/** Write header + rows in trail order, routing rows interleaved verbatim. */
function writeTrail(rows: Array<WorkflowStage | RoutingDecision>): WorkflowHeader {
	appendHeader(tmpDir, baseHeader);
	for (const row of rows) {
		if ("type" in row && row.type === "routing") appendRoutingDecision(tmpDir, baseHeader.runId, row);
		else appendStage(tmpDir, baseHeader.runId, row as WorkflowStage);
	}
	return baseHeader;
}

// ---------------------------------------------------------------------------
// Fresh re-entry budgets on resume (revisits + laps) — both directions.
// The per-destination ledgers are ENGINE MEMORY (never folded from the
// trail), so a resume starts both empty: the direction that GRANTS (a
// stranded cap-halt's first re-entry counts 1 and continues) and the
// direction that BINDS (fresh budgets still halt an always-retry loop, so
// repeated resumes cannot loop forever). Plus the fold-never-consults-hook
// pin: reconstructState replays rows, it never votes.
// ---------------------------------------------------------------------------

describe("resumeWorkflow — fresh re-entry budgets (revisits + laps)", () => {
	/** Write an artifact file at the given relative path under tmpDir. */
	const writeArtifact = (relPath: string, content = "") => {
		const parts = relPath.split("/");
		const dir = join(tmpDir, ...parts.slice(0, -1));
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(tmpDir, relPath), content);
	};

	/** The stranded trail: pass 1 completed, then the ORIGINAL invocation's
	 * guard halted re-entering `a` at its cap — the failure row a resume picks up. */
	const capHaltedRows = (): WorkflowStage[] => [
		{
			session: null,
			stageNumber: 1,
			stage: "a",
			skill: "a",
			status: "completed",
			ts: "t1",
			output: fakeOutput([fakeArtifact(".rpiv/artifacts/a/a1.md")]),
		},
		{
			session: null,
			stageNumber: 2,
			stage: "b",
			skill: "b",
			status: "completed",
			ts: "t2",
			output: fakeOutput([fakeArtifact(".rpiv/artifacts/b/b1.md")]),
		},
		{
			session: null,
			stageNumber: 3,
			stage: "a",
			skill: "a",
			status: "failed",
			ts: "t3",
			errMsg: 'Backward-jump limit exceeded: stage "a" re-entered 4 times (max 3)',
		},
	];

	const loopWf = (pick: () => "a" | "stop", progress?: import("../api.js").StageDef["progress"]): Workflow => ({
		name: "resume-wf",
		start: "a",
		stages: {
			a: { kind: "produces", sessionPolicy: "fresh", outcome: artifactOutcome, ...(progress ? { progress } : {}) },
			b: { kind: "produces", sessionPolicy: "fresh", outcome: artifactOutcome },
		},
		edges: {
			a: "b",
			b: defineRoute(["a", "stop"], pick, { readsData: false }),
		},
	});

	it("stranded cap-halt: the resumed run's first re-entry counts 1 on fresh revisits/laps and continues", async () => {
		appendHeader(tmpDir, resumeHeader);
		for (const row of capHaltedRows()) appendStage(tmpDir, resumeHeader.runId, row);
		for (const rel of [
			".rpiv/artifacts/a/a2.md",
			".rpiv/artifacts/b/b2.md",
			".rpiv/artifacts/a/a3.md",
			".rpiv/artifacts/b/b3.md",
		]) {
			writeArtifact(rel);
		}

		let picks = 0;
		const chain = createMockSessionChain({
			cwd: tmpDir,
			steps: [
				{ branch: [mockAssistantMessage("Wrote .rpiv/artifacts/a/a2.md")] },
				{ branch: [mockAssistantMessage("Wrote .rpiv/artifacts/b/b2.md")] },
				{ branch: [mockAssistantMessage("Wrote .rpiv/artifacts/a/a3.md")] },
				{ branch: [mockAssistantMessage("Wrote .rpiv/artifacts/b/b3.md")] },
			],
		});

		const result = await resumeWorkflow(chain.ctx, {
			workflow: loopWf(() => (++picks <= 1 ? "a" : "stop")),
			header: resumeHeader,
			ref: "@2026-06-03_07-30-00-ab12",
		});

		// Failed-trailer re-ran `a` (a2) → b (b2) → b's decision re-entered `a` —
		// the FIRST re-entry on the fresh ledgers (revisits 1, laps 1), not the
		// 5th on the exhausted ones — then a3 → b3 → stop.
		expect(result.success).toBe(true);
		expect(result.stagesCompleted).toBe(6);
	});

	it("fresh budgets still bind — a hook-less always-retry loop stops at the FRESH cap after resume", async () => {
		appendHeader(tmpDir, resumeHeader);
		for (const row of capHaltedRows()) appendStage(tmpDir, resumeHeader.runId, row);

		for (let i = 2; i <= 5; i++) {
			writeArtifact(`.rpiv/artifacts/a/a${i}.md`);
			writeArtifact(`.rpiv/artifacts/b/b${i}.md`);
		}
		const steps: Array<{ branch: ReturnType<typeof mockAssistantMessage>[] }> = [];
		for (let i = 2; i <= 5; i++) {
			steps.push({ branch: [mockAssistantMessage(`Wrote .rpiv/artifacts/a/a${i}.md`)] });
			steps.push({ branch: [mockAssistantMessage(`Wrote .rpiv/artifacts/b/b${i}.md`)] });
		}
		const chain = createMockSessionChain({ cwd: tmpDir, steps });

		const result = await resumeWorkflow(chain.ctx, {
			workflow: loopWf(() => "a"),
			header: resumeHeader,
			ref: "@2026-06-03_07-30-00-ab12",
		});

		// Fresh cap 3: the resumed run re-runs a, b (a2/b2), then 3 counted
		// re-entries (a3/b3, a4/b4, a5/b5) and halts when the 4th re-entry reads
		// revisits 4 > 3 — a FRESH 4, not the pre-resume cumulative (a stale
		// ledger would have halted the very first re-entry instead).
		expect(result.success).toBe(false);
		expect(result.error).toMatch(/4.*max 3/);
		expect(result.stagesCompleted).toBe(10);
	});

	it("fresh budgets still bind — an all-improved loop stops at the ceiling (maxLaps threads through resume)", async () => {
		appendHeader(tmpDir, resumeHeader);
		for (const row of capHaltedRows()) appendStage(tmpDir, resumeHeader.runId, row);

		for (let i = 2; i <= 4; i++) {
			writeArtifact(`.rpiv/artifacts/a/a${i}.md`);
			writeArtifact(`.rpiv/artifacts/b/b${i}.md`);
		}
		const steps: Array<{ branch: ReturnType<typeof mockAssistantMessage>[] }> = [];
		for (let i = 2; i <= 4; i++) {
			steps.push({ branch: [mockAssistantMessage(`Wrote .rpiv/artifacts/a/a${i}.md`)] });
			steps.push({ branch: [mockAssistantMessage(`Wrote .rpiv/artifacts/b/b${i}.md`)] });
		}
		const chain = createMockSessionChain({ cwd: tmpDir, steps });

		const result = await resumeWorkflow(chain.ctx, {
			workflow: loopWf(
				() => "a",
				() => "improved",
			),
			header: resumeHeader,
			ref: "@2026-06-03_07-30-00-ab12",
			maxBackwardJumps: 5,
			maxLaps: 2,
		});

		// cap 5 is outlived by "improved" waivers; the fresh lap ceiling (2)
		// still binds: re-entries 1 and 2 are waived, the 3rd (laps 3 > 2) halts.
		expect(result.success).toBe(false);
		expect(result.error).toMatch(/absolute lap ceiling/);
		expect(result.error).toMatch(/3.*max 2/);
		expect(result.stagesCompleted).toBe(8);
	});

	it("a malformed budget is refused pre-flight on resume — no row appended, no re-dispatch", async () => {
		appendHeader(tmpDir, resumeHeader);
		const rows = capHaltedRows();
		for (const row of rows) appendStage(tmpDir, resumeHeader.runId, row);
		const before = readFileSync(join(tmpDir, ".rpiv", "workflows", "runs", `${resumeHeader.runId}.jsonl`), "utf8");
		const chain = createMockSessionChain({ cwd: tmpDir, steps: [] });

		const result = await resumeWorkflow(chain.ctx, {
			workflow: loopWf(
				() => "a",
				() => "improved",
			),
			header: resumeHeader,
			ref: "@2026-06-03_07-30-00-ab12",
			maxBackwardJumps: 5,
			maxLaps: Number.NaN,
		});

		expect(result).toEqual({
			stagesCompleted: 0,
			success: false,
			error: "maxLaps must be a non-negative integer, got NaN",
		});
		const after = readFileSync(join(tmpDir, ".rpiv", "workflows", "runs", `${resumeHeader.runId}.jsonl`), "utf8");
		expect(after).toBe(before);
	});

	it("the fold never consults the progress hook — reconstructState replays rows without voting", async () => {
		const progressSpy = vi.fn(() => "improved" as const);
		const spyWf: Workflow = {
			name: "test-wf",
			start: "a",
			stages: {
				a: { kind: "produces", sessionPolicy: "fresh", outcome: makeOutcome("a"), progress: progressSpy },
				b: { kind: "produces", sessionPolicy: "fresh", outcome: makeOutcome("b") },
			},
			edges: {
				a: "b",
				b: defineRoute(["a", "stop"], () => "stop", { readsData: false }),
			},
		};
		// A trail with a revisit round: a, b, a, b — the fold replays all four.
		writeRunStages([
			{
				session: null,
				stageNumber: 1,
				stage: "a",
				skill: "a",
				status: "completed",
				ts: "t1",
				output: fakeOutput([fakeArtifact(".rpiv/artifacts/a/a1.md")]),
			},
			{
				session: null,
				stageNumber: 2,
				stage: "b",
				skill: "b",
				status: "completed",
				ts: "t2",
				output: fakeOutput([fakeArtifact(".rpiv/artifacts/b/b1.md")]),
			},
			{
				session: null,
				stageNumber: 3,
				stage: "a",
				skill: "a",
				status: "completed",
				ts: "t3",
				output: fakeOutput([fakeArtifact(".rpiv/artifacts/a/a2.md")]),
			},
			{
				session: null,
				stageNumber: 4,
				stage: "b",
				skill: "b",
				status: "completed",
				ts: "t4",
				output: fakeOutput([fakeArtifact(".rpiv/artifacts/b/b2.md")]),
			},
		]);

		const recon = await reconstructState(tmpDir, spyWf, baseHeader);

		expect(recon.ok).toBe(true);
		expect(progressSpy).not.toHaveBeenCalled();
	});
});

describe("resumeWorkflow — gate-stop halts (the re-measure)", () => {
	it("produces gate: resume re-runs the halted gate against the repaired tree and continues on pass", async () => {
		const doneSpy = vi.fn();
		// The gate's judgment is a function of the tree — the flag file stands in
		// for the hand-repair the halt toast asks for.
		const wf: Workflow = {
			name: "test-wf",
			start: "plan",
			stages: {
				plan: { kind: "produces", sessionPolicy: "fresh" },
				check: produces.script({
					run: ({ cwd }) => ({
						kind: "artifacts",
						artifacts: [],
						data: { verdict: existsSync(join(cwd, "fixed.flag")) ? "pass" : "fail" },
					}),
				}),
				done: acts.script({ run: doneSpy }),
			},
			edges: {
				plan: "check",
				check: match("verdict", { done: "pass" }, { from: "check" }),
				done: "stop",
			},
		} as Workflow;

		writeTrail([
			{
				session: null,
				stageNumber: 1,
				stage: "plan",
				skill: "plan",
				status: "completed",
				ts: "t1",
				output: fakeOutput([fakeArtifact("plans/p1.md")]),
			},
			{
				session: null,
				stageNumber: 2,
				stage: "check",
				status: "completed",
				ts: "t2",
				output: { ...fakeOutput(), data: { verdict: "fail" } },
			},
			stopRow("check", 2, 'value "fail" matched no branch'),
			gateHaltRow("check", 3),
		]);

		writeFileSync(join(tmpDir, "fixed.flag"), ""); // the hand-repair
		const chain = createMockSessionChain({ cwd: tmpDir, steps: [] });
		const result = await resumeWorkflow(chain.ctx, { workflow: wf, header: baseHeader, ref: "@ref" });

		expect(result.success).toBe(true);
		expect(doneSpy).toHaveBeenCalledTimes(1);
		const stages = readAllStages(tmpDir, baseHeader.runId);
		const appended = stages.slice(3);
		expect(appended.map((s) => [s.stage, s.status])).toEqual([
			["check", "completed"],
			["done", "completed"],
		]);
	});

	it("produces gate, nothing repaired: resume re-measures and halts again (idempotent stop, no stale pass)", async () => {
		const doneSpy = vi.fn();
		const wf: Workflow = {
			name: "test-wf",
			start: "check",
			stages: {
				check: produces.script({
					run: ({ cwd }) => ({
						kind: "artifacts",
						artifacts: [],
						data: { verdict: existsSync(join(cwd, "fixed.flag")) ? "pass" : "fail" },
					}),
				}),
				done: acts.script({ run: doneSpy }),
			},
			edges: { check: match("verdict", { done: "pass" }, { from: "check" }), done: "stop" },
		} as Workflow;

		writeTrail([
			{
				session: null,
				stageNumber: 1,
				stage: "check",
				status: "completed",
				ts: "t1",
				output: { ...fakeOutput(), data: { verdict: "fail" } },
			},
			stopRow("check", 1, 'value "fail" matched no branch'),
			gateHaltRow("check", 2),
		]);

		const chain = createMockSessionChain({ cwd: tmpDir, steps: [] });
		const result = await resumeWorkflow(chain.ctx, { workflow: wf, header: baseHeader, ref: "@ref" });

		expect(result.success).toBe(false);
		expect(result.error).toContain("matched no branch");
		expect(doneSpy).not.toHaveBeenCalled();
	});

	it("LIVE formation: an unchanged acts digest halts at the arm's own gate, and resume dispatches onward (e2e)", async () => {
		// End to end through the real runner: the acts stage's NAMED outcome
		// publishes its digest onto state.named (the side-effect publish rule),
		// the gate folds it and stops with a note, chain-advance writes the
		// [stop row, FAIL_GATE_STOP row] pair — and the resume entry then takes
		// the side-effect arm, dispatching `verify` instead of replaying `fix`.
		const digestOutcome: import("../output-spec.js").Outcome<unknown, "digest", { changed: boolean }> = {
			name: "digest",
			collector: {
				collect: () => ({ kind: "ok", artifacts: [{ handle: opaque("digest-unchanged"), role: "digest" }] }),
			},
			parser: { parse: () => ({ kind: "ok", payload: { kind: "digest", data: { changed: false } } }) },
		};
		const fixGate: EdgeFn = defineRoute(
			["verify", "stop"],
			({ state }) => {
				const data = state.named.digest?.at(-1)?.data as { changed?: unknown } | undefined;
				if (data?.changed !== false) return "verify";
				setRouteNote(fixGate, "digest unchanged");
				return "stop";
			},
			{ readsData: false },
		);
		const verifySpy = vi.fn(() => ({ kind: "artifacts" as const, artifacts: [], data: { verdict: "pass" } }));
		const wf: Workflow = {
			name: "test-wf",
			start: "fix",
			stages: {
				fix: acts({ skill: "fix", outcome: digestOutcome }),
				verify: produces.script({ run: verifySpy }),
			},
			edges: { fix: fixGate, verify: "stop" },
		} as Workflow;

		const live = createMockSessionChain({
			cwd: tmpDir,
			steps: [{ branch: [mockAssistantMessage("nothing to change")] }],
		});
		const halted = await runWorkflow(live.ctx, { workflow: wf, input: "x" });
		expect(halted.success).toBe(false);
		expect(halted.error).toContain("digest unchanged");

		const header = readHeader(tmpDir, halted.runId!);
		if (!header) throw new Error("halted run wrote no header");
		const resumed = createMockSessionChain({ cwd: tmpDir, steps: [] });
		const result = await resumeWorkflow(resumed.ctx, { workflow: wf, header, ref: "@ref" });

		expect(result.success).toBe(true);
		expect(verifySpy).toHaveBeenCalledTimes(1);
		expect(resumed.sentMessages.some((m) => m.startsWith("/skill:fix"))).toBe(false);
	});

	it("the halt toast names the resume remedy with the run id", () => {
		// The remedy string is what turns "fix and re-run" (read as: start over,
		// re-paying the whole front-load) into "fix and resume".
		const toast = FAIL_GATE_STOP("validate", 'value "fail" matched no branch', "2026-06-03_07-30-00-ab12").toast;
		expect(toast).toContain("resume with /wf @2026-06-03_07-30-00-ab12");
	});

	it("an exhausted-budget halt points at a fresh run, NOT resume (resume would re-decide the same stop)", () => {
		// meta unit-graph exhaustion vocabulary — the round/generation counters are
		// derived from the trail and never reset on resume, so `/wf @<id>` re-halts
		// identically. Each exhaustion note must drop the resume remedy.
		for (const note of [
			"plan red — 3/3 rounds spent; 1 failure(s), first: missing await",
			"plan red — the same failures survived a correction (round 2); 1 failure(s)",
			"implement FATAL — the user's pre-existing work was lost; see trail",
			"plan-verdicts: no gate record — terminated (integrity stop)",
		]) {
			const { toast, error } = FAIL_GATE_STOP("plan-gate", note, "2026-10-01_08-57-20-042b");
			expect(toast).toContain("start a fresh run");
			expect(toast).not.toContain("resume with /wf");
			// "matched no branch" is wrong for a halt that routed to `stop` on purpose.
			expect(toast).not.toContain("matched no branch");
			expect(error).not.toContain("matched no branch");
		}
	});

	it("multi-target side-effect gate: resume re-routes (idempotent re-stop) — never replays the arm", async () => {
		const fixSpy = vi.fn();
		const route: EdgeFn = defineRoute(["verify", "alt", "stop"], () => {
			setRouteNote(route, "still blocked");
			return "stop";
		});
		const wf: Workflow = {
			name: "test-wf",
			start: "fix",
			stages: {
				fix: acts.script({ run: fixSpy }),
				verify: produces.script({ run: () => ({ kind: "artifacts", artifacts: [], data: {} }) }),
				alt: produces.script({ run: () => ({ kind: "artifacts", artifacts: [], data: {} }) }),
			},
			edges: { fix: route, verify: "stop", alt: "stop" },
		} as Workflow;

		writeTrail([
			{ session: null, stageNumber: 1, stage: "fix", status: "completed", ts: "t1", output: fakeOutput() },
			stopRow("fix", 1, "still blocked"),
			gateHaltRow("fix", 2),
		]);

		const chain = createMockSessionChain({ cwd: tmpDir, steps: [] });
		const result = await resumeWorkflow(chain.ctx, { workflow: wf, header: baseHeader, ref: "@ref" });

		// The ambiguous onward set re-fires the EDGE, not the arm: the route
		// re-stops with its note and the run halts again — zero side effects.
		expect(result.success).toBe(false);
		expect(result.error).toContain("still blocked");
		expect(fixSpy).not.toHaveBeenCalled();
	});

	it("side-effect gate: resume dispatches the sole onward target instead of replaying the arm", async () => {
		const fixSpy = vi.fn();
		const verifySpy = vi.fn(() => ({ kind: "artifacts" as const, artifacts: [], data: { verdict: "pass" } }));
		const wf: Workflow = {
			name: "test-wf",
			start: "fix",
			stages: {
				fix: acts.script({ run: fixSpy }),
				verify: produces.script({ run: verifySpy }),
			},
			edges: {
				// The unchanged-tree shape: the arm ran, changed nothing, and its
				// own edge stopped the run. Re-running the arm on resume would
				// no-op again and re-trip the same gate — the livelock this entry
				// exists to break.
				fix: defineRoute(["verify", "stop"], () => "stop"),
				verify: "stop",
			},
		} as Workflow;

		writeTrail([
			{ session: null, stageNumber: 1, stage: "fix", status: "completed", ts: "t1", output: fakeOutput() },
			stopRow("fix", 1, "remediation left the working tree unchanged"),
			gateHaltRow("fix", 2),
		]);

		const chain = createMockSessionChain({ cwd: tmpDir, steps: [] });
		const result = await resumeWorkflow(chain.ctx, { workflow: wf, header: baseHeader, ref: "@ref" });

		expect(result.success).toBe(true);
		expect(fixSpy).not.toHaveBeenCalled();
		expect(verifySpy).toHaveBeenCalledTimes(1);
		const stages = readAllStages(tmpDir, baseHeader.runId);
		expect(stages.slice(2).map((s) => [s.stage, s.status])).toEqual([["verify", "completed"]]);
	});
});
