/**
 * lane-snapshot — the assembly's own test.
 *
 * `buildLaneSnapshot` is the ONE place the lane registry is read for rendering, so this is
 * where the token arithmetic lives: the three-source fold (folded prior-stage orchestrator
 * tokens + the current stage's live units + the run's recorded subagent contribution), the
 * per-unit effective usage, the per-stage lines, the needs-input derivation, and the
 * read-once/lazy read discipline. Every test drives the port with a LITERAL `LaneReader` —
 * plain arrays and objects, no process-global registry, no reset between tests — which is
 * what the refactor bought.
 *
 * `lane-list.test.ts` asserts only how a RESOLVED snapshot renders; the numbers it used to
 * fold out of registry state are asserted here.
 */

import { describe, expect, it } from "vitest";
import { buildLaneSnapshot, type LaneReader, type LaneSnapshot } from "./lane-snapshot.js";
import type { LaneUsage } from "./lane-usage.js";
import {
	type DisplayRow,
	type LaneEntry,
	type LaneSession,
	type PendingInput,
	SINGLE_UNIT_KEY,
	type UnitLane,
} from "./run-lane-types.js";

// ---------------------------------------------------------------------------
// Literal builders — the whole point of the refactor: no registry, no reset.
// ---------------------------------------------------------------------------

/** A complete `LaneUsage` literal (total recomputed from the parts, as `addLaneUsage` does). */
function usage(input: number, output: number, cacheRead = 0, cacheWrite = 0, cost?: number): LaneUsage {
	const u: LaneUsage = { input, output, cacheRead, cacheWrite, total: input + output + cacheRead + cacheWrite };
	if (cost !== undefined) u.cost = cost;
	return u;
}

/** A `UnitLane` with sane defaults: running, no live session, an empty input FIFO. */
function unitLane(input: Partial<UnitLane> & Pick<UnitLane, "index">): UnitLane {
	return {
		index: input.index,
		label: input.label,
		status: input.status ?? "running",
		currentSession: input.currentSession,
		finalBranch: input.finalBranch,
		finalCwd: input.finalCwd,
		finalToolDefs: input.finalToolDefs,
		finalUsage: input.finalUsage,
		lastSessionFile: input.lastSessionFile,
		pendingInput: input.pendingInput ?? [],
	};
}

/** A `LaneEntry` with sane defaults: running, name = workflow ?? "wf", empty maps. */
function lane(input: Partial<LaneEntry> & Pick<LaneEntry, "runId">): LaneEntry {
	return {
		runId: input.runId,
		name: input.name ?? input.workflow ?? "wf",
		workflow: input.workflow,
		input: input.input,
		status: input.status ?? "running",
		units: input.units ?? new Map<number, UnitLane>(),
		stageUsage: input.stageUsage ?? new Map<string, LaneUsage>(),
		progress: input.progress,
		error: input.error,
		lastArtifact: input.lastArtifact,
		recap: input.recap,
		needsInputSince: input.needsInputSince,
		abort: input.abort,
	};
}

/** A deferred UI request, enough for the `pendingInput` queue to be non-empty. */
function pendingInput(): PendingInput {
	return { factory: (() => ({})) as never, options: undefined as never, resolve: () => {} };
}

/** A live child session whose only interesting surface is `getUsage`. */
function liveSession(getUsage: () => unknown): LaneSession {
	return {
		sessionId: "s-live",
		isStreaming: true,
		sessionManager: { getBranch: () => [], getCwd: () => "/tmp" },
		getToolDefinition: () => undefined,
		getStreamingMessage: () => undefined,
		getUsage,
		subscribe: () => () => {},
	};
}

/** The rows the registry's display read would build for these lanes: the lane row, then its
 *  unit sub-rows ascending by index — and ONLY indices ≥ 0 (`SINGLE_UNIT_KEY` is the lane
 *  row's own session, so a single-stage lane yields exactly one row). The lane order is the
 *  reader's order: `buildLaneSnapshot` does NOT sort. */
function displayRows(lanes: readonly LaneEntry[]): DisplayRow[] {
	return lanes.flatMap((lane) => [
		{ kind: "lane", lane } as DisplayRow,
		...[...lane.units.values()]
			.filter((unit) => unit.index >= 0)
			.sort((a, b) => a.index - b.index)
			.map((unit) => ({ kind: "unit", lane, unit }) as DisplayRow),
	]);
}

/** The literal adapter to the `LaneReader` port, with optional per-test overrides (a
 *  call-recording subagent read, a live-session usage read, …). */
function readerOf(lanes: readonly LaneEntry[], overrides: Partial<LaneReader> = {}): LaneReader {
	const list = [...lanes];
	return {
		listLanes: () => list,
		listLanesForDisplay: () => displayRows(list),
		getSubagentUsageForRun: () => undefined,
		getSubagentUsageForStage: () => undefined,
		...overrides,
	};
}

function snapshotOf(lanes: readonly LaneEntry[], overrides: Partial<LaneReader> = {}): LaneSnapshot {
	return buildLaneSnapshot(readerOf(lanes, overrides));
}

// ---------------------------------------------------------------------------

describe("buildLaneSnapshot — the three-source token fold", () => {
	it("unifies the folded stages + live units + the run's subagent contribution exactly once", () => {
		// run-1: folded prior stages (plan 1000/500, research 100/20) + two live units
		// (200/100 and 50/25 +10 cacheRead) + a run-level subagent contribution (30/15).
		const run1 = lane({
			runId: "run-1",
			name: "ship",
			stageUsage: new Map([
				["plan", usage(1000, 500)],
				["research", usage(100, 20)],
			]),
			units: new Map<number, UnitLane>([
				[0, unitLane({ index: 0, finalUsage: usage(200, 100) })],
				[1, unitLane({ index: 1, status: "done", finalUsage: usage(50, 25, 10, 0) })],
			]),
		});
		const snapshot = snapshotOf([run1], { getSubagentUsageForRun: () => usage(30, 15) });

		// folded  {1100, 520,   0, 0} → + units {250, 125,  10, 0} → + subagent {30, 15, 0, 0}
		//        = {1380, 660,  10, 0} (total recomputed from the four parts).
		const expected = { input: 1380, output: 660, cacheRead: 10, cacheWrite: 0, total: 2050 };
		const laneRow = snapshot.rows[0];
		expect(laneRow.kind).toBe("lane");
		expect(laneRow.usage).toEqual(expected);
		// The grand total is the same fold, so the row tally and the heading cannot disagree.
		expect(snapshot.totals.usage).toEqual(expected);
		// The unit rows keep their own usage — the lane fold never leaks onto a sub-row.
		expect(snapshot.rows[1].usage).toEqual(usage(200, 100));
		expect(snapshot.rows[2].usage).toEqual(usage(50, 25, 10, 0));
	});

	it("totals.usage is the sum of every lane's resolved row total", () => {
		const snapshot = snapshotOf([
			lane({ runId: "run-1", name: "ship" }),
			lane({
				runId: "run-2",
				name: "build",
				units: new Map([[SINGLE_UNIT_KEY, unitLane({ index: SINGLE_UNIT_KEY, finalUsage: usage(2000, 1000) })]]),
			}),
			lane({
				runId: "run-3",
				name: "vet",
				units: new Map([[SINGLE_UNIT_KEY, unitLane({ index: SINGLE_UNIT_KEY, finalUsage: usage(7, 3, 0, 0) })]]),
			}),
		]);
		// run-1 contributes nothing; run-2 2000/1000; run-3 7/3 → {2007, 1003, 0, 0, 3010}.
		// SINGLE_UNIT_KEY slots never flatten into sub-rows, so rows are the three lane rows.
		expect(snapshot.totals.usage).toEqual(usage(2007, 1003));
		expect(snapshot.rows[0].usage).toBeUndefined();
		expect(snapshot.rows[1].usage).toEqual(usage(2000, 1000));
		expect(snapshot.rows[2].usage).toEqual(usage(7, 3));
	});

	it("carries no usage when no source contributes (the addLaneUsage identity)", () => {
		const snapshot = snapshotOf([lane({ runId: "run-1", name: "ship" })]);
		expect(snapshot.rows[0].usage).toBeUndefined();
		expect(snapshot.totals.usage).toBeUndefined();
	});

	it("a subagent-only lane's total is exactly that contribution (a zero-orchestrator lane)", () => {
		const snapshot = snapshotOf([lane({ runId: "run-1", name: "ship" })], {
			getSubagentUsageForRun: () => usage(800, 400),
		});
		expect(snapshot.rows[0].usage).toEqual(usage(800, 400));
		expect(snapshot.totals.usage).toEqual(usage(800, 400));
	});

	it("a multi-stage lane's row total equals the sum of its stageLinesFor tallies", () => {
		// The row tally is run-so-far; the per-stage lines partition the same tokens. The two
		// folds read one result, so their sums must agree.
		const snapshot = snapshotOf(
			[
				lane({
					runId: "run-1",
					name: "ship",
					progress: { stageName: "build", phase: "running" },
					stageUsage: new Map([
						["plan", usage(1000, 500)],
						["research", usage(100, 20)],
					]),
					units: new Map([[0, unitLane({ index: 0, finalUsage: usage(200, 100) })]]),
				}),
			],
			// The two reads are two views of one store: the stage-scoped contribution that shows
			// up in the build line must also be the run-scoped contribution the row folds.
			{
				getSubagentUsageForRun: () => usage(5, 5),
				getSubagentUsageForStage: (_runId, stage) => (stage === "build" ? usage(5, 5) : undefined),
			},
		);
		const lines = snapshot.stageLinesFor("run-1");
		// plan {1000,500} + research {100,20} + build (live units 200/100 + subagent 5/5)
		expect(lines.map((l) => l.usage)).toEqual([usage(1000, 500), usage(100, 20), usage(205, 105)]);
		// Row total = plan + research + build = {1305, 625} — the sum of the lines above.
		expect(snapshot.rows[0].usage).toEqual(usage(1305, 625));
		expect(snapshot.totals.usage).toEqual(usage(1305, 625));
	});
});

describe("buildLaneSnapshot — per-unit usage resolution (unitUsage semantics)", () => {
	it("a unit's retained finalUsage wins over its live session's usage", () => {
		const snapshot = snapshotOf([
			lane({
				runId: "run-1",
				name: "ship",
				units: new Map([
					[
						0,
						unitLane({
							index: 0,
							finalUsage: usage(100, 50),
							currentSession: liveSession(() => ({
								tokens: { input: 999, output: 999, cacheRead: 0, cacheWrite: 0 },
							})),
						}),
					],
				]),
			}),
		]);
		expect(snapshot.rows[1].usage).toEqual(usage(100, 50)); // the snapshot, never the live child
		expect(snapshot.rows[0].usage).toEqual(usage(100, 50));
	});

	it("a unit with neither a snapshot nor a live session contributes nothing", () => {
		const snapshot = snapshotOf([
			lane({
				runId: "run-1",
				name: "ship",
				units: new Map([
					[0, unitLane({ index: 0 })],
					[1, unitLane({ index: 1, status: "done" })],
				]),
			}),
		]);
		expect(snapshot.rows[1].usage).toBeUndefined();
		expect(snapshot.rows[2].usage).toBeUndefined();
		expect(snapshot.rows[0].usage).toBeUndefined();
	});

	it("a live session's usage is narrowed through toLaneUsage, and a malformed/degenerate one is a no-op", () => {
		const snapshot = snapshotOf([
			lane({
				runId: "run-1",
				name: "ship",
				units: new Map([
					[
						0,
						unitLane({
							index: 0,
							currentSession: liveSession(() => ({
								tokens: { input: 10, output: 5, cacheRead: 1, cacheWrite: 2 },
							})),
						}),
					],
					[1, unitLane({ index: 1, currentSession: liveSession(() => ({ notTokens: true })) })],
				]),
			}),
		]);
		// toLaneUsage recomputes the missing total from the four parts.
		expect(snapshot.rows[1].usage).toEqual(usage(10, 5, 1, 2));
		expect(snapshot.rows[2].usage).toBeUndefined(); // malformed stats → undefined
	});

	it("a THROWING live getUsage() is fail-soft — the unit contributes nothing and nothing throws", () => {
		const snapshot = snapshotOf([
			lane({
				runId: "run-1",
				name: "ship",
				units: new Map([
					[
						0,
						unitLane({
							index: 0,
							currentSession: liveSession(() => {
								throw new Error("session disposed");
							}),
						}),
					],
					[1, unitLane({ index: 1, finalUsage: usage(4, 2) })],
				]),
			}),
		]);
		expect(snapshot.rows[1].usage).toBeUndefined();
		expect(snapshot.rows[2].usage).toEqual(usage(4, 2)); // a sibling's failure never poisons the fold
		expect(snapshot.rows[0].usage).toEqual(usage(4, 2));
	});

	it("accumulates unit cost only when a unit carries one (sumUnits' cost path)", () => {
		const snapshot = snapshotOf([
			lane({
				runId: "run-1",
				name: "ship",
				units: new Map([
					[0, unitLane({ index: 0, finalUsage: usage(10, 5, 0, 0, 0.25) })],
					[1, unitLane({ index: 1, status: "done", finalUsage: usage(20, 10, 0, 0, 0.5) })],
					[2, unitLane({ index: 2, status: "done", finalUsage: usage(1, 0) })], // no cost
				]),
			}),
		]);
		expect(snapshot.rows[0].usage).toEqual(usage(31, 15, 0, 0, 0.75));
	});
});

describe("buildLaneSnapshot — lazy per-stage work", () => {
	it("resolves NO stage's subagent contribution until stageLinesFor is called", () => {
		const stageReads: string[] = [];
		const snapshot = snapshotOf(
			[
				lane({
					runId: "run-1",
					name: "ship",
					progress: { stageName: "build", phase: "running" },
					stageUsage: new Map([
						["plan", usage(10, 0)],
						["research", usage(20, 0)],
					]),
				}),
			],
			{
				getSubagentUsageForStage: (runId, stage) => {
					stageReads.push(`${runId}:${stage}`);
					return undefined;
				},
			},
		);
		// Building the snapshot is the per-frame cost; the console reveals the breakdown only
		// on `s`, so folding every run's stages here would make a keypress a per-frame cost.
		expect(stageReads).toEqual([]);
		const lines = snapshot.stageLinesFor("run-1");
		expect(lines.map((l) => l.name)).toEqual(["plan", "research", "build"]);
		expect(stageReads).toEqual(["run-1:plan", "run-1:research", "run-1:build"]);
		// A second call re-resolves (the lines are not cached) — one read per stage line.
		snapshot.stageLinesFor("run-1");
		expect(stageReads).toEqual([
			"run-1:plan",
			"run-1:research",
			"run-1:build",
			"run-1:plan",
			"run-1:research",
			"run-1:build",
		]);
	});
});

describe("buildLaneSnapshot — stageLinesFor", () => {
	it("returns [] for a missing runId", () => {
		expect(snapshotOf([lane({ runId: "run-1", name: "ship" })]).stageLinesFor("nope")).toEqual([]);
		expect(snapshotOf([]).stageLinesFor("run-1")).toEqual([]);
	});

	it("returns the folded stages in insertion order, then the current stage only when it is new", () => {
		const appended = snapshotOf([
			lane({
				runId: "run-1",
				name: "ship",
				progress: { stageName: "build", phase: "running" },
				stageUsage: new Map([
					["plan", usage(10, 0)],
					["research", usage(20, 0)],
				]),
			}),
		]).stageLinesFor("run-1");
		expect(appended.map((l) => l.name)).toEqual(["plan", "research", "build"]);

		// A current stage already folded into stageUsage is NOT re-appended.
		const folded = snapshotOf([
			lane({
				runId: "run-1",
				name: "ship",
				progress: { stageName: "plan", phase: "running" },
				stageUsage: new Map([["plan", usage(10, 0)]]),
			}),
		]).stageLinesFor("run-1");
		expect(folded.map((l) => l.name)).toEqual(["plan"]);
	});

	it("folds the current stage's live units into its line, and never into a prior stage's", () => {
		const lines = snapshotOf([
			lane({
				runId: "run-1",
				name: "ship",
				progress: { stageName: "build", phase: "running" },
				stageUsage: new Map([["plan", usage(1000, 500)]]),
				units: new Map([[0, unitLane({ index: 0, finalUsage: usage(200, 100) })]]),
			}),
		]).stageLinesFor("run-1");
		expect(lines).toEqual([
			{ name: "plan", usage: usage(1000, 500) },
			{ name: "build", usage: usage(200, 100) },
		]);
	});

	it("folds a stage's subagent contribution into that stage's line", () => {
		const lines = snapshotOf(
			[
				lane({
					runId: "run-1",
					name: "ship",
					progress: { stageName: "research", phase: "running" },
					units: new Map([[0, unitLane({ index: 0, finalUsage: usage(100, 0) })]]),
				}),
			],
			{ getSubagentUsageForStage: (_runId, stage) => (stage === "research" ? usage(30, 0) : undefined) },
		).stageLinesFor("run-1");
		expect(lines).toEqual([{ name: "research", usage: usage(130, 0) }]);
	});

	it("lists a stage that carries no usage at all (the renderer is what skips an empty tally)", () => {
		const lines = snapshotOf([
			lane({ runId: "run-1", name: "ship", progress: { stageName: "plan", phase: "running" } }),
		]).stageLinesFor("run-1");
		expect(lines).toHaveLength(1);
		expect(lines[0].name).toBe("plan");
		expect(lines[0].usage).toBeUndefined();
	});
});

describe("buildLaneSnapshot — recapFor", () => {
	it("returns the lane's recap and undefined for a missing runId", () => {
		const recap = { outcome: "completed" as const, artifacts: ["a.md"], workflow: "ship" };
		const snapshot = snapshotOf([
			lane({ runId: "run-1", name: "ship", status: "completed", recap }),
			lane({ runId: "run-2", name: "build", status: "completed" }), // retired but no recap stored
		]);
		expect(snapshot.recapFor("run-1")).toBe(recap);
		expect(snapshot.recapFor("run-2")).toBeUndefined();
		expect(snapshot.recapFor("nope")).toBeUndefined();
	});
});

describe("buildLaneSnapshot — needs-input derivation", () => {
	it("marks and counts a lane whose unit carries a deferred request, and leaves the rest alone", () => {
		const snapshot = snapshotOf([
			lane({
				runId: "run-1",
				name: "ship",
				needsInputSince: 1000,
				units: new Map([[0, unitLane({ index: 0, pendingInput: [pendingInput()] })]]),
			}),
			lane({ runId: "run-2", name: "build", units: new Map([[0, unitLane({ index: 0 })]]) }),
		]);
		expect(snapshot.totals.needsInput).toBe(1);
		// Rows: run-1 lane, run-1 unit 0, run-2 lane, run-2 unit 0 — only run-1's rows shout.
		expect(snapshot.rows.map((r) => r.needsInput)).toEqual([true, true, false, false]);
	});

	it("derives needs-input from the SINGLE_UNIT_KEY slot too (a single-stage lane still shouts)", () => {
		const snapshot = snapshotOf([
			lane({
				runId: "run-1",
				name: "ship",
				needsInputSince: 1000,
				units: new Map([[SINGLE_UNIT_KEY, unitLane({ index: SINGLE_UNIT_KEY, pendingInput: [pendingInput()] })]]),
			}),
		]);
		expect(snapshot.totals.needsInput).toBe(1);
		expect(snapshot.rows).toHaveLength(1); // SINGLE_UNIT_KEY never flattens into a sub-row
		expect(snapshot.rows[0].needsInput).toBe(true);
	});

	it("oldestNeedsInputSince is the OLDEST clock among the lanes awaiting input", () => {
		const snapshot = snapshotOf([
			lane({
				runId: "run-1",
				name: "ship",
				needsInputSince: 1000,
				units: new Map([[0, unitLane({ index: 0, pendingInput: [pendingInput()] })]]),
			}),
			lane({
				runId: "run-2",
				name: "build",
				needsInputSince: 500,
				units: new Map([[0, unitLane({ index: 0, pendingInput: [pendingInput()] })]]),
			}),
			lane({ runId: "run-3", name: "vet", needsInputSince: 100, units: new Map([[0, unitLane({ index: 0 })]]) }), // needs nothing — its clock is ignored
		]);
		expect(snapshot.totals.needsInput).toBe(2);
		expect(snapshot.totals.oldestNeedsInputSince).toBe(500);
	});

	it("oldestNeedsInputSince is undefined when no lane carries a clock, even when lanes need input", () => {
		const snapshot = snapshotOf([
			lane({
				runId: "run-1",
				name: "ship",
				units: new Map([[0, unitLane({ index: 0, pendingInput: [pendingInput()] })]]),
			}),
		]);
		expect(snapshot.totals.needsInput).toBe(1);
		expect(snapshot.totals.oldestNeedsInputSince).toBeUndefined();
	});
});

describe("buildLaneSnapshot — totals", () => {
	it("lanes counts every lane; active counts the running ones only", () => {
		const snapshot = snapshotOf([
			lane({ runId: "run-1", name: "ship" }),
			lane({ runId: "run-2", name: "build" }),
			lane({ runId: "run-3", name: "vet", status: "completed" }),
			lane({ runId: "run-4", name: "polish", status: "failed" }),
		]);
		expect(snapshot.totals.lanes).toBe(4);
		expect(snapshot.totals.active).toBe(2);
	});

	it("an empty reader yields no rows and a zeroed total", () => {
		const snapshot = snapshotOf([]);
		expect(snapshot.rows).toEqual([]);
		expect(snapshot.totals).toEqual({
			lanes: 0,
			active: 0,
			needsInput: 0,
			oldestNeedsInputSince: undefined,
			usage: undefined,
		});
	});
});

describe("buildLaneSnapshot — read-once discipline", () => {
	it("reads a lane's run-level subagent total at most once per snapshot, not once per row", () => {
		const reads: string[] = [];
		const lanes = [
			lane({
				runId: "run-1",
				name: "ship",
				units: new Map([
					[0, unitLane({ index: 0 })],
					[1, unitLane({ index: 1 })],
				]),
			}),
		];
		const snapshot = snapshotOf(lanes, {
			getSubagentUsageForRun: (runId) => {
				reads.push(runId);
				return undefined;
			},
		});
		// Three rows (lane + two units) and the totals loop all want the lane total; the
		// memo makes that ONE read per lane per snapshot.
		expect(snapshot.rows).toHaveLength(3);
		expect(reads).toEqual(["run-1"]);
	});

	it("reads each unit's effective usage once per snapshot, not once per consumer", () => {
		let liveReads = 0;
		const lanes = [
			lane({
				runId: "run-1",
				name: "ship",
				progress: { stageName: "plan", phase: "running" },
				units: new Map([
					[
						0,
						unitLane({
							index: 0,
							currentSession: liveSession(() => {
								liveReads++;
								return { tokens: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0 } };
							}),
						}),
					],
				]),
			}),
		];
		const snapshot = snapshotOf(lanes);
		// The sub-row tally and the parent lane's total both consume this unit's usage.
		expect(snapshot.rows[1].usage).toEqual(usage(10, 5));
		expect(snapshot.rows[0].usage).toEqual(usage(10, 5));
		expect(liveReads).toBe(1);
		// A per-stage read reuses the same memo for the current stage.
		snapshot.stageLinesFor("run-1");
		expect(liveReads).toBe(1);
	});
});
