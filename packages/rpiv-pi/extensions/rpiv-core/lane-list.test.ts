import { initTheme, type Theme } from "@earendil-works/pi-coding-agent";
import { beforeAll, describe, expect, it } from "vitest";
import {
	computeLaneLayout,
	computeViewport,
	MAX_DOCK_ROWS,
	MAX_WIDGET_LINES,
	renderLaneList,
	renderRecap,
	renderStageBreakdown,
} from "./lane-list.js";
import { buildLaneSnapshot, type LaneReader, type LaneSnapshot } from "./lane-snapshot.js";
import { formatTokens, type LaneUsage } from "./lane-usage.js";
import {
	type DisplayRow,
	type LaneEntry,
	type PendingInput,
	SINGLE_UNIT_KEY,
	type UnitLane,
} from "./run-lane-types.js";

/**
 * Identity theme — fg/bg/bold return their text unchanged so a rendered line reads
 * plainly and the active↔ambient row diff reduces to the leading gutter glyph only.
 * (Same helper the sibling lane tests use.)
 */
const identityTheme = {
	fg: (_c: string, s: string) => s,
	bg: (_c: string, s: string) => s,
	bold: (s: string) => s,
	strikethrough: (s: string) => s,
} as unknown as Theme;

/**
 * Encoding theme — fg → "color:text", bg → "[color]text", bold → "*text*" so the
 * selected-row styling (accent+bold descriptor) is observable without ANSI.
 */
const encTheme = {
	fg: (c: string, s: string) => `${c}:${s}`,
	bg: (c: string, s: string) => `[${c}]${s}`,
	bold: (s: string) => `*${s}*`,
	strikethrough: (s: string) => s,
} as unknown as Theme;

/** Minimal DisplayRow cast helper — computeViewport reads ONLY `row.kind` + array
 *  position, so a `{ kind }` object is sufficient (no real lane/unit payload needed). */
const mk = (...kinds: ("lane" | "unit")[]): DisplayRow[] => kinds.map((kind) => ({ kind }) as DisplayRow);

// ---------------------------------------------------------------------------
// Literal builders — the renderers take a value now, so these tests drive a
// literal snapshot with NO registry behind them (no module state, no reset).
// The token ARITHMETIC the old tests folded out of registry state lives in
// lane-snapshot.test.ts; everything below asserts how a resolved value renders.
// ---------------------------------------------------------------------------

/** A complete `LaneUsage` literal (total recomputed from the parts). */
function usage(input: number, output: number, cacheRead = 0, cacheWrite = 0): LaneUsage {
	return { input, output, cacheRead, cacheWrite, total: input + output + cacheRead + cacheWrite };
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

/**
 * The literal adapter to the `LaneReader` port — the whole point of the refactor. Rows
 * come from the lanes in the ARRAY order given (`buildLaneSnapshot` does NOT sort), each
 * lane followed by its unit sub-rows ascending by index and ONLY for indices ≥ 0 (the
 * `SINGLE_UNIT_KEY` slot is the lane row's own session, so a single-stage lane yields
 * exactly one row).
 */
function snapshotOf(lanes: readonly LaneEntry[], reader: Partial<LaneReader> = {}): LaneSnapshot {
	const list = [...lanes];
	const rows: DisplayRow[] = list.flatMap((l) => [
		{ kind: "lane", lane: l } as DisplayRow,
		...[...l.units.values()]
			.filter((unit) => unit.index >= 0)
			.sort((a, b) => a.index - b.index)
			.map((unit) => ({ kind: "unit", lane: l, unit }) as DisplayRow),
	]);
	return buildLaneSnapshot({
		listLanes: () => list,
		listLanesForDisplay: () => rows,
		getSubagentUsageForRun: () => undefined,
		getSubagentUsageForStage: () => undefined,
		...reader,
	});
}

beforeAll(() => {
	initTheme(); // SDK theme proxies read a global theme; seed it (mirrors sibling lane tests)
});

describe("renderLaneList", () => {
	/** Lane budget well above every seeded row count so no scroll-follow fold appears. */
	const LANE_CAP = computeLaneLayout(40).laneCap; // 11
	const W = 80;

	/**
	 * The static-lanes invariant: under an identity theme, an ambient render
	 * (active:false) and a stepped-in render (active:true, selection=K) over the SAME
	 * snapshot produce IDENTICAL line arrays except the selected row, which
	 * differs ONLY by its leading gutter (`❯ ` vs `  `). Identity theme collapses
	 * accent/bold/text descriptors to the same plain string, so the gutter glyph is
	 * the sole diff. `activeRow.replace(/^❯ /, "  ") === ambientRow` proves it — any
	 * positional shift would break the equality.
	 */
	function expectStaticLanes(snapshot: LaneSnapshot, selection: number, frame = 0): void {
		const ambient = renderLaneList(identityTheme, W, snapshot, {
			active: false,
			selection,
			frame,
			laneCap: LANE_CAP,
		});
		const active = renderLaneList(identityTheme, W, snapshot, { active: true, selection, frame, laneCap: LANE_CAP });
		expect(active.length).toBe(ambient.length);
		// Exactly one active line carries the cursor; ambient carries none.
		expect(active.filter((l) => l.startsWith("❯ ")).length).toBe(1);
		expect(ambient.some((l) => l.startsWith("❯ "))).toBe(false);
		for (let i = 0; i < ambient.length; i++) {
			if (active[i].startsWith("❯ ")) {
				// The selected row differs ONLY by its leading gutter: ❯-space vs two spaces.
				expect(active[i].replace(/^❯ /, "  ")).toBe(ambient[i]);
			} else {
				expect(active[i]).toBe(ambient[i]);
			}
		}
	}

	it("static-lanes invariant: active differs from ambient only by the selected row's leading gutter", () => {
		// A mixed lane set exercising several row shapes — none needs-input (those
		// stamp a Date.now() age into the heading, which could flake a byte-for-byte
		// comparison across a second boundary). running / completed / failed only.
		// The literal order is the render order: the registry used to sort its display
		// rows (needs→running→terminal, insertion-stable); the snapshot does not, so
		// this spells out what that sort would have produced — run-1, run-2, run-3.
		const snapshot = snapshotOf([
			lane({ runId: "run-1", name: "ship", progress: { stageName: "plan", phase: "running" } }),
			lane({ runId: "run-2", name: "build", status: "completed" }),
			lane({ runId: "run-3", name: "vet", status: "failed", error: "boom" }),
		]);
		// The invariant holds for EVERY row kind as the selected row.
		expectStaticLanes(snapshot, 0); // running + live progress lane
		expectStaticLanes(snapshot, 1); // completed lane
		expectStaticLanes(snapshot, 2); // failed lane
	});

	it("the invariant holds with the SAME spinner frame on both renders (frame is the only cross-render variable)", () => {
		// A running lane's glyph comes from SPINNER_FRAMES[frame]; using identical frames
		// on both renders is what keeps the glyph identical (and the invariant intact).
		const snapshot = snapshotOf([lane({ runId: "run-1", name: "ship" })]);
		expectStaticLanes(snapshot, 0, 2);
	});

	it("covers a unit sub-row selection, not just a lane row", () => {
		// A fanout lane flattens to [lane, unit, unit] display rows; selecting the unit
		// sub-row still differs from ambient by only the gutter.
		const snapshot = snapshotOf([
			lane({
				runId: "run-1",
				name: "build",
				units: new Map<number, UnitLane>([
					[0, unitLane({ index: 0, label: "phase 1/2" })],
					[1, unitLane({ index: 1, label: "phase 2/2" })],
				]),
			}),
		]);
		// Display rows: 0 = lane, 1 = unit phase 1, 2 = unit phase 2.
		expectStaticLanes(snapshot, 2); // the LAST unit sub-row
	});

	it("styling invariant: under an encoding theme, only the selected row's descriptor flips to accent+bold; row count + columns are stable", () => {
		// Two running lanes whose descriptor is the runId (name === workflow) so the
		// accent/text descriptor styling is unambiguous: "accent:*run-1*" vs "text:run-1".
		const snapshot = snapshotOf([
			lane({ runId: "run-1", name: "ship", workflow: "ship" }),
			lane({ runId: "run-2", name: "build", workflow: "build" }),
		]);
		const ambient = renderLaneList(encTheme, W, snapshot, {
			active: false,
			selection: 0,
			frame: 0,
			laneCap: LANE_CAP,
		});
		const active = renderLaneList(encTheme, W, snapshot, { active: true, selection: 0, frame: 0, laneCap: LANE_CAP });
		// Equal row count.
		expect(active.length).toBe(ambient.length);
		const cursorIdx = active.findIndex((l) => l.includes("❯"));
		expect(cursorIdx).toBeGreaterThan(-1);
		// Every NON-selected line is byte-identical — the selected row is the only diff.
		for (let i = 0; i < ambient.length; i++) {
			if (i === cursorIdx) continue;
			expect(active[i]).toBe(ambient[i]);
		}
		// The selected row's descriptor is accent+bold; the ambient same row is plain text.
		expect(active[cursorIdx]).toContain("accent:*run-1*");
		expect(ambient[cursorIdx]).toContain("text:run-1");
		expect(active[cursorIdx]).not.toContain("text:run-1");
		// No positional shift: both lane descriptors start at the same column (the fixed
		// gutter + tag column are width-equal across rows under this theme).
		const r1 = ambient.find((l) => l.includes("run-1")) ?? "";
		const r2 = ambient.find((l) => l.includes("run-2")) ?? "";
		expect(r1.indexOf("text:run-1")).toBe(r2.indexOf("text:run-2"));
	});

	it("returns [] when the snapshot has no rows", () => {
		expect(
			renderLaneList(identityTheme, W, snapshotOf([]), { active: false, selection: 0, frame: 0, laneCap: LANE_CAP }),
		).toEqual([]);
	});

	it("otherwise frames ['', heading, '', ...rows] with NO footer or rule line (each surface owns those)", () => {
		const snapshot = snapshotOf([lane({ runId: "run-1", name: "ship" }), lane({ runId: "run-2", name: "build" })]);
		const lines = renderLaneList(identityTheme, W, snapshot, {
			active: false,
			selection: 0,
			frame: 0,
			laneCap: LANE_CAP,
		});
		expect(lines[0]).toBe(""); // leading rhythm blank
		expect(lines[1]).toContain("Runs"); // the shared heading chip
		expect(lines[2]).toBe(""); // blank under the heading
		expect(lines.some((l) => l.includes("ship"))).toBe(true);
		expect(lines.some((l) => l.includes("build"))).toBe(true);
		// No discoverability footer, no bottom rule — those are per-surface (dock/console).
		expect(lines.some((l) => l.includes("/lanes"))).toBe(false);
		expect(lines.some((l) => /^─+$/.test(l))).toBe(false);
	});

	it("renders the needs-input glyph + heading path (a unit's deferred request drives it, no vi.mock)", () => {
		// The needs-input signal is DERIVED from the entries the reader returned — a unit
		// with a non-empty pendingInput queue — so the ⚑ glyph + the ● "N runs need input"
		// heading render off the literal snapshot, with no registry and no module mock.
		const snapshot = snapshotOf([
			lane({
				runId: "run-1",
				name: "ship",
				needsInputSince: Date.now(),
				units: new Map<number, UnitLane>([
					[SINGLE_UNIT_KEY, unitLane({ index: SINGLE_UNIT_KEY, pendingInput: [pendingInput()] })],
				]),
			}),
		]);
		const lines = renderLaneList(identityTheme, W, snapshot, {
			active: false,
			selection: 0,
			frame: 0,
			laneCap: LANE_CAP,
		});
		const out = lines.join("\n");
		expect(out).toContain("●"); // static urgency dot in the heading
		expect(out).toMatch(/1 run needs input · \d+s/); // aging count heading
		expect(out).toContain("⚑"); // the needs-input row glyph
		expect(out).toContain("needs input"); // the needs-input row trailing label
	});
});

describe("renderLaneList — completed-lane lastArtifact segment", () => {
	const LANE_CAP = computeLaneLayout(40).laneCap; // 11
	// Wide enough that the full artifact path renders untruncated — truncation on a
	// narrow terminal (criterion #3) is a separate concern exercised manually.
	const W = 200;

	it("renders `→ <bucket>/<file>` as a trailing segment AFTER the usage tally on a completed lane", () => {
		// A completed lane with live stage progress + usage + lastArtifact renders:
		//   …commit · ↑134k ↓26k R2.1M → builds/ship.md
		// (displayArtifact strips the canonical `.rpiv/artifacts/` root — display only,
		// the stored lastArtifact keeps the full path.) The usage rides the lane's unit
		// (`finalUsage`, the teardown snapshot); the artifact segment is the LAST tail
		// segment (after the usage tally).
		const snapshot = snapshotOf([
			lane({
				runId: "run-1",
				name: "ship",
				workflow: "ship",
				status: "completed",
				progress: { stageName: "commit", phase: "running" },
				lastArtifact: ".rpiv/artifacts/builds/ship.md",
				units: new Map<number, UnitLane>([
					[SINGLE_UNIT_KEY, unitLane({ index: SINGLE_UNIT_KEY, finalUsage: usage(134000, 26000, 2_100_000, 0) })],
				]),
			}),
		]);
		const lines = renderLaneList(identityTheme, W, snapshot, {
			active: false,
			selection: 0,
			frame: 0,
			laneCap: LANE_CAP,
		});
		const row = lines.find((l) => l.includes("commit")) ?? "";
		expect(row).toContain("↑134k");
		expect(row).toContain("R2.1M");
		// The artifact segment is present, canonical root stripped …
		expect(row).toContain("→ builds/ship.md");
		expect(row).not.toContain(".rpiv/artifacts"); // display form only
		// … and trails the usage tally (the `→` comes after the last usage segment).
		expect(row.lastIndexOf("↑134k")).toBeLessThan(row.indexOf("→ builds/ship.md"));
	});

	it("renders NO `→` segment when lastArtifact is undefined (byte-identical to a side-effect-only run)", () => {
		// r2: a completed lane with no lastArtifact must append nothing — no `→` segment,
		// no column shift. A side-effect-only run (no produces stage) hits exactly this path.
		const snapshot = snapshotOf([
			lane({
				runId: "run-1",
				name: "ship",
				workflow: "ship",
				status: "completed",
				progress: { stageName: "commit", phase: "running" },
				units: new Map<number, UnitLane>([
					[SINGLE_UNIT_KEY, unitLane({ index: SINGLE_UNIT_KEY, finalUsage: usage(100, 50) })],
				]),
			}),
		]);
		const lines = renderLaneList(identityTheme, W, snapshot, {
			active: false,
			selection: 0,
			frame: 0,
			laneCap: LANE_CAP,
		});
		const row = lines.find((l) => l.includes("commit")) ?? "";
		expect(row).not.toContain("→"); // no trailing artifact segment at all
		expect(row).toContain("↑100"); // usage tally still renders
	});
});

describe("computeViewport", () => {
	it("no-fold: when rows.length ≤ laneCap, returns the whole list with no fold flags", () => {
		const rows = mk("lane", "lane", "lane");
		expect(computeViewport(rows, 1, 5)).toEqual({ start: 0, window: 3, above: 0, below: 0 });
		// Selection is irrelevant under no-fold (the whole list is shown).
		expect(computeViewport(rows, 0, 5)).toEqual({ start: 0, window: 3, above: 0, below: 0 });
		expect(computeViewport(rows, 2, 5)).toEqual({ start: 0, window: 3, above: 0, below: 0 });
	});

	it("selection-in-window: for overflow, start ≤ selection and selection < start + window (cursor never stranded)", () => {
		// 12 lanes (> a laneCap of 5 → window 3) — the cursor must stay inside the window
		// at every selection, including the extreme ends.
		const rows = mk("lane", "lane", "lane", "lane", "lane", "lane", "lane", "lane", "lane", "lane", "lane", "lane");
		const laneCap = 5;
		for (const sel of [0, 1, 3, 6, 9, 11]) {
			const vp = computeViewport(rows, sel, laneCap);
			expect(vp.start).toBeLessThanOrEqual(sel);
			expect(sel).toBeLessThan(vp.start + vp.window);
		}
	});

	it("atomic group fold: the window starts on a LANE boundary, never a bare unit (unless pinned by the selection)", () => {
		// Groups of 3 (lane + 2 units), 4 groups = 12 rows. laneCap 5 → window 3.
		const rows = mk("lane", "unit", "unit", "lane", "unit", "unit", "lane", "unit", "unit", "lane", "unit", "unit");
		// selection 5 is a unit (group 2's 2nd unit). Naive centering lands start on 4 (a
		// unit); the fold walks it back to 3 (the parent lane). selection stays in view.
		const vp = computeViewport(rows, 5, 5);
		expect(vp.start).toBe(3);
		expect(rows[vp.start].kind).toBe("lane"); // never starts on a bare unit
		expect(vp.start).toBeLessThanOrEqual(5);
		expect(5).toBeLessThan(vp.start + vp.window);
		// The whole group [3,6) renders together: the lane + both its units.
		expect(rows[vp.start + 1].kind).toBe("unit");
		expect(rows[vp.start + 2].kind).toBe("unit");
	});

	it("atomic group fold: a partial group cut at the bottom edge BELOW the selection folds to +N below, not split mid-group", () => {
		// Groups of 4 (lane + 3 units), 5 groups = 20 rows. laneCap 7 → window 5.
		const rows = mk(
			"lane",
			"unit",
			"unit",
			"unit",
			"lane",
			"unit",
			"unit",
			"unit",
			"lane",
			"unit",
			"unit",
			"unit",
			"lane",
			"unit",
			"unit",
			"unit",
			"lane",
			"unit",
			"unit",
			"unit",
		);
		// selection 2 is group 1's 3rd unit. Naive end = 5 (a unit in group 2); the cut
		// group 2 is entirely below the selection, so end folds back to 4 (group 2's lane
		// boundary) and group 2+ collapses into "+N below". The window shows full group 1.
		const vp = computeViewport(rows, 2, 7);
		expect(vp.start).toBe(0);
		expect(vp.window).toBe(4); // folded down from 5 → 4
		expect(rows[vp.start + vp.window].kind).toBe("lane"); // the fold point is a lane boundary
		expect(vp.below).toBe(1); // group 2+ folded below
		expect(vp.above).toBe(0);
		// selection (group 1's unit) stays in the window.
		expect(vp.start).toBeLessThanOrEqual(2);
		expect(2).toBeLessThan(vp.start + vp.window);
	});

	it("fold flags: above === 1 iff start > 0; below === 1 iff start + window < rows.length; both 0 in no-fold", () => {
		const groups3 = mk(
			"lane",
			"unit",
			"unit",
			"lane",
			"unit",
			"unit",
			"lane",
			"unit",
			"unit",
			"lane",
			"unit",
			"unit",
		);
		const lanes = mk("lane", "lane", "lane", "lane", "lane", "lane", "lane", "lane", "lane", "lane");
		const cases: Array<[DisplayRow[], number, number]> = [
			[lanes.slice(0, 3), 1, 5], // no-fold → both 0
			[lanes, 0, 5], // overflow from the top
			[lanes, 9, 5], // overflow at the bottom edge
			[lanes, 4, 5], // overflow mid-list
			[groups3, 5, 5], // group-aware top fold
		];
		for (const [rows, sel, cap] of cases) {
			const vp = computeViewport(rows, sel, cap);
			expect(vp.above).toBe(vp.start > 0 ? 1 : 0);
			expect(vp.below).toBe(vp.start + vp.window < rows.length ? 1 : 0);
		}
	});
});

describe("computeLaneLayout", () => {
	it("laneCap is capped at MAX_WIDGET_LINES - 1 however tall the terminal", () => {
		expect(computeLaneLayout(100).laneCap).toBe(MAX_WIDGET_LINES - 1); // 11
		expect(computeLaneLayout(1000).laneCap).toBe(MAX_WIDGET_LINES - 1); // never grows unbounded
	});

	it("totalRows is capped at MAX_DOCK_ROWS", () => {
		expect(computeLaneLayout(100).totalRows).toBe(MAX_DOCK_ROWS); // 40
	});

	it("clamps DOWN on a tiny terminal (total ≤ terminal.rows, never overflows)", () => {
		expect(computeLaneLayout(8)).toEqual({ totalRows: 8, laneCap: 2 });
	});

	it("laneCap is floored at 1, never 0, even when termRows ≤ overhead", () => {
		expect(computeLaneLayout(3).laneCap).toBe(1);
		expect(computeLaneLayout(1).laneCap).toBe(1);
	});
});

describe("renderLaneList — subagent token roll-in", () => {
	const LANE_CAP = computeLaneLayout(40).laneCap; // 11
	const W = 120;

	it("a row with BOTH orchestrator units and a subagent contribution renders the two summed", () => {
		// The row's tally must show the SUM of the two stores — ↑130 ↓50. The arithmetic
		// identity itself (100 + 30 = 130) is asserted in lane-snapshot.test.ts; here we
		// assert that the resolved sum renders.
		const snapshot = snapshotOf(
			[
				lane({
					runId: "run-1",
					name: "ship",
					workflow: "ship",
					progress: { stageName: "research", phase: "running" },
					units: new Map<number, UnitLane>([
						[SINGLE_UNIT_KEY, unitLane({ index: SINGLE_UNIT_KEY, finalUsage: usage(100, 50) })],
					]),
				}),
			],
			// The run-level subagent read (`getSubagentUsageForRun`) is the contribution.
			{ getSubagentUsageForRun: () => usage(30, 0) },
		);
		const lines = renderLaneList(identityTheme, W, snapshot, {
			active: false,
			selection: 0,
			frame: 0,
			laneCap: LANE_CAP,
		});
		const row = lines.find((l) => l.includes("research")) ?? "";
		expect(row).toContain(`↑${formatTokens(130)}`); // 100 (orch) + 30 (subagent)
		expect(row).toContain(`↓${formatTokens(50)}`); // 50 (orch) + 0 (subagent)
	});

	it("a run with NO subagent completions renders byte-identical to before (roll-up is undefined → no-op)", () => {
		// addLaneUsage(x, undefined) === x, so a subagent-free lane renders exactly the
		// orchestrator tally — no phantom tokens, no column shift.
		const snapshot = snapshotOf([
			lane({
				runId: "run-1",
				name: "ship",
				workflow: "ship",
				progress: { stageName: "plan", phase: "running" },
				units: new Map<number, UnitLane>([
					[SINGLE_UNIT_KEY, unitLane({ index: SINGLE_UNIT_KEY, finalUsage: usage(1000, 500, 200, 0) })],
				]),
			}),
		]);
		const lines = renderLaneList(identityTheme, W, snapshot, {
			active: false,
			selection: 0,
			frame: 0,
			laneCap: LANE_CAP,
		});
		const row = lines.find((l) => l.includes("plan")) ?? "";
		// Orchestrator-only tally: ↑1.0k ↓500 R200 — nothing added by the subagent store.
		expect(row).toContain(`↑${formatTokens(1000)}`);
		expect(row).toContain(`↓${formatTokens(500)}`);
		expect(row).toContain(`R${formatTokens(200)}`);
	});
});

describe("renderStageBreakdown — per-stage token breakdown", () => {
	const W = 120;

	it("returns [] for a missing/evicted lane", () => {
		expect(renderStageBreakdown(identityTheme, W, snapshotOf([]).stageLinesFor("nope"))).toEqual([]);
	});

	it("returns [] when no stage carries usage", () => {
		// No units with usage, no stageUsage, no subagent → the stage line resolves with an
		// undefined tally and is skipped.
		const snapshot = snapshotOf([
			lane({ runId: "run-1", name: "ship", progress: { stageName: "plan", phase: "running" } }),
		]);
		expect(renderStageBreakdown(identityTheme, W, snapshot.stageLinesFor("run-1"))).toEqual([]);
	});

	it("renders a prior stage from folded stageUsage (units already cleared)", () => {
		// A folded stage keeps its tokens in stageUsage after the transition cleared the
		// units (the bridge always pairs fold + clear), so its line still renders.
		const snapshot = snapshotOf([
			lane({
				runId: "run-1",
				name: "ship",
				progress: { stageName: "plan", phase: "running" },
				stageUsage: new Map([["plan", usage(1000, 0)]]),
			}),
		]);
		const lines = renderStageBreakdown(identityTheme, W, snapshot.stageLinesFor("run-1"));
		const planLine = lines.find((l) => l.includes("plan")) ?? "";
		expect(planLine).toContain("plan");
		expect(planLine).toContain(`↑${formatTokens(1000)}`);
	});

	it("renders the current stage from LIVE units (final-stage read-model — no fold fired)", () => {
		// The LAST/current stage has no fold yet — its orchestrator portion reads the
		// lane's units (their retained finalUsage) at render time.
		const snapshot = snapshotOf([
			lane({
				runId: "run-1",
				name: "ship",
				progress: { stageName: "implement", phase: "running" },
				units: new Map<number, UnitLane>([
					[SINGLE_UNIT_KEY, unitLane({ index: SINGLE_UNIT_KEY, finalUsage: usage(500, 200) })],
				]),
			}),
		]);
		const lines = renderStageBreakdown(identityTheme, W, snapshot.stageLinesFor("run-1"));
		const implLine = lines.find((l) => l.includes("implement")) ?? "";
		expect(implLine).toContain("implement");
		expect(implLine).toContain(`↑${formatTokens(500)}`);
		expect(implLine).toContain(`↓${formatTokens(200)}`);
	});

	it("folds subagent tokens into a stage's tally", () => {
		const snapshot = snapshotOf(
			[
				lane({
					runId: "run-1",
					name: "ship",
					progress: { stageName: "research", phase: "running" },
					units: new Map<number, UnitLane>([
						[SINGLE_UNIT_KEY, unitLane({ index: SINGLE_UNIT_KEY, finalUsage: usage(100, 0) })],
					]),
				}),
			],
			// The stage-scoped subagent read (`getSubagentUsageForStage`).
			{ getSubagentUsageForStage: (_runId, stage) => (stage === "research" ? usage(30, 0) : undefined) },
		);
		const lines = renderStageBreakdown(identityTheme, W, snapshot.stageLinesFor("run-1"));
		const researchLine = lines.find((l) => l.includes("research")) ?? "";
		// Orchestrator (100) + subagent (30) = 130
		expect(researchLine).toContain(`↑${formatTokens(130)}`);
	});

	it("renders multiple stages in execution order (prior folded, then current)", () => {
		// plan is folded into stageUsage; build is the current stage reading its live unit.
		const snapshot = snapshotOf([
			lane({
				runId: "run-1",
				name: "ship",
				status: "completed",
				progress: { stageName: "build", phase: "running" },
				stageUsage: new Map([["plan", usage(100, 0)]]),
				units: new Map<number, UnitLane>([
					[SINGLE_UNIT_KEY, unitLane({ index: SINGLE_UNIT_KEY, finalUsage: usage(200, 0) })],
				]),
			}),
		]);
		const lines = renderStageBreakdown(identityTheme, W, snapshot.stageLinesFor("run-1"));
		// Both stages present: plan (folded) then build (current).
		expect(lines.some((l) => l.includes("plan"))).toBe(true);
		expect(lines.some((l) => l.includes("build"))).toBe(true);
		// Execution order: plan (insertion-ordered in stageUsage) before build (appended as current).
		const planIdx = lines.findIndex((l) => l.includes("plan"));
		const buildIdx = lines.findIndex((l) => l.includes("build"));
		expect(planIdx).toBeLessThan(buildIdx);
	});
});

describe("renderRecap — end-of-run summary", () => {
	const W = 120;

	it("returns [] for a missing/evicted lane", () => {
		expect(renderRecap(identityTheme, W, snapshotOf([]).recapFor("nope"))).toEqual([]);
	});

	it("returns [] when the lane has no recap (running / reactivated lane — byte-identical render)", () => {
		const snapshot = snapshotOf([lane({ runId: "run-1", name: "ship", status: "completed" })]); // retired but no recap stored
		expect(renderRecap(identityTheme, W, snapshot.recapFor("run-1"))).toEqual([]);
	});

	it("emits NO header (no status glyph, no outcome word, no ` · workflow` segment)", () => {
		const lines = renderRecap(identityTheme, W, { outcome: "completed", workflow: "ship", artifacts: ["a.md"] });
		const out = lines.join("\n");
		// No status glyph (▶✓✗⊘), no outcome word, no `· workflow` segment — the header was a
		// duplicate of the lane chip's status and is dropped.
		expect(out).not.toMatch(/[▶✓✗⊘]/);
		expect(out).not.toContain("completed");
		expect(out).not.toContain("· ship");
	});

	it("renders ONE line: the NEWEST artifact (trail-order last) + a `+N more` count", () => {
		const lines = renderRecap(identityTheme, W, {
			outcome: "completed",
			artifacts: [".rpiv/artifacts/plans/a.md", ".rpiv/artifacts/builds/b.md"],
		});
		// Single summary line — never a per-artifact report. displayArtifact strips the
		// canonical `.rpiv/artifacts/` root (display only — the stored path is full).
		expect(lines.length).toBe(1);
		expect(lines[0]).toContain("→ builds/b.md"); // newest, not the first
		expect(lines[0]).not.toContain(".rpiv/artifacts"); // root stripped for display
		expect(lines[0]).not.toContain("plans/a.md"); // older artifacts fold into the count
		expect(lines[0]).toContain("+1 more");
	});

	it("omits the `+N more` count for a single-artifact recap", () => {
		const lines = renderRecap(identityTheme, W, { outcome: "completed", artifacts: [".rpiv/artifacts/builds/b.md"] });
		expect(lines.length).toBe(1);
		expect(lines[0]).toContain("→ builds/b.md");
		expect(lines[0]).not.toContain("more");
	});

	it("passes a non-canonical artifact path through untouched (url/opaque/out-of-tree handles)", () => {
		const lines = renderRecap(identityTheme, W, { outcome: "completed", artifacts: ["https://example.com/report"] });
		expect(lines[0]).toContain("→ https://example.com/report");
	});

	it("stays ONE line regardless of artifact count (the summary never grows with data size)", () => {
		const lines = renderRecap(identityTheme, W, {
			outcome: "failed",
			failureReason: "build exploded",
			artifacts: Array.from({ length: 20 }, (_v, i) => `a${i}.md`),
		});
		expect(lines.length).toBe(1);
		expect(lines[0]).toContain("→ a19.md"); // newest
		expect(lines[0]).toContain("+19 more");
		expect(lines[0]).toContain("⚠ build exploded"); // reason shares the same line
	});

	it("returns [] for a completed recap with no artifacts (nothing to add beyond the lane chip)", () => {
		expect(renderRecap(identityTheme, W, { outcome: "completed", artifacts: [] })).toEqual([]);
	});

	it("renders the `⚠ reason` segment only for a NON-completed outcome that carries a failureReason", () => {
		const lines = renderRecap(identityTheme, W, {
			outcome: "failed",
			failureReason: "blueprint produced no plan",
			artifacts: [],
		});
		expect(lines.length).toBe(1); // reason alone still summarizes (untruncated by the chip's short form)
		expect(lines[0]).toContain("⚠ blueprint produced no plan");
	});

	it("renders NO `⚠` segment for a completed outcome (even if a failureReason were present)", () => {
		const lines = renderRecap(identityTheme, W, {
			outcome: "completed",
			failureReason: "should not show",
			artifacts: ["a.md"],
		});
		expect(lines.every((l) => !l.includes("⚠"))).toBe(true);
	});

	it("returns [] for a non-completed recap with no failureReason and no artifacts", () => {
		expect(renderRecap(identityTheme, W, { outcome: "aborted", artifacts: [] })).toEqual([]);
	});

	it("renders routingNotes as dim parts ordered after the artifact arrow and before the ⚠ reason", () => {
		// Encoding theme: fg(c, s) → "c:s", so the dim part is observable. One
		// joined line — arrow, then note, then reason.
		const lines = renderRecap(encTheme, W, {
			outcome: "failed",
			failureReason: "grade exploded",
			artifacts: [".rpiv/artifacts/builds/b.md"],
			routingNotes: ["pass-through: implement-scope-check defers to validate"],
		});
		expect(lines.length).toBe(1);
		const out = lines[0] as string;
		const arrowIdx = out.indexOf("→ builds/b.md");
		const noteIdx = out.indexOf("dim:pass-through: implement-scope-check defers to validate");
		const reasonIdx = out.indexOf("⚠ grade exploded");
		expect(arrowIdx).toBeGreaterThanOrEqual(0);
		expect(noteIdx).toBeGreaterThan(arrowIdx);
		expect(reasonIdx).toBeGreaterThan(noteIdx);
	});

	it("renders routingNotes alone on an artifact-less recap (still a single line)", () => {
		expect(
			renderRecap(identityTheme, W, {
				outcome: "completed",
				artifacts: [],
				routingNotes: ["pass-through: implement-scope-check defers to validate"],
			}),
		).toEqual(["pass-through: implement-scope-check defers to validate"]);
	});

	it("renders byte-identically when routingNotes is absent (no note parts leak)", () => {
		const lines = renderRecap(identityTheme, W, { outcome: "failed", failureReason: "x", artifacts: ["a.md"] });
		expect(lines.length).toBe(1);
		expect(lines[0]).toContain("→ a.md");
		expect(lines[0]).toContain("⚠ x");
		expect(lines[0]).not.toContain("pass-through");
	});
});

describe("renderLaneList — run grand total", () => {
	const LANE_CAP = computeLaneLayout(40).laneCap; // 11
	// Wide enough that the heading tally never truncates — the dock heading is short
	// (< 60 cols even with a tally), so this is headroom, not a width-stress case.
	const W = 200;

	it("heading shows the summed grand total across ≥2 lanes (orchestrator tokens summed)", () => {
		// Two lanes, each carrying orchestrator usage on its single-unit lane. The heading
		// tally is the pairwise sum of BOTH lanes' totals:
		//   run-1 {input:1000, output:500} + run-2 {input:2000, output:1000}
		//   → {input:3000, output:1500} → ↑3.0k ↓1.5k (cacheRead 0 omitted).
		// The arithmetic identity is asserted on the resolved totals in lane-snapshot.test.ts.
		const snapshot = snapshotOf([
			lane({
				runId: "run-1",
				name: "ship",
				workflow: "ship",
				status: "completed",
				units: new Map<number, UnitLane>([
					[SINGLE_UNIT_KEY, unitLane({ index: SINGLE_UNIT_KEY, finalUsage: usage(1000, 500) })],
				]),
			}),
			lane({
				runId: "run-2",
				name: "build",
				workflow: "build",
				status: "completed",
				units: new Map<number, UnitLane>([
					[SINGLE_UNIT_KEY, unitLane({ index: SINGLE_UNIT_KEY, finalUsage: usage(2000, 1000) })],
				]),
			}),
		]);
		const lines = renderLaneList(identityTheme, W, snapshot, {
			active: false,
			selection: 0,
			frame: 0,
			laneCap: LANE_CAP,
		});
		const heading = lines[1]; // ['', heading, '', ...rows]
		expect(heading).toContain(`↑${formatTokens(3000)}`); // 1000 + 2000
		expect(heading).toContain(`↓${formatTokens(1500)}`); // 500 + 1000
	});

	it("grand total includes subagent tokens (a zero-orchestrator lane reflects its subagent contribution)", () => {
		// A lane with NO orchestrator usage (no units) but a subagent contribution: its
		// lane total folds the reader's run-level subagent read onto the (absent) unit
		// total, so the heading reflects exactly that contribution. cacheRead is forced 0,
		// and cacheWrite = total − input − output.
		const snapshot = snapshotOf([lane({ runId: "run-1", name: "ship" })], {
			getSubagentUsageForRun: () => usage(800, 400, 0, 0),
		});
		const lines = renderLaneList(identityTheme, W, snapshot, {
			active: false,
			selection: 0,
			frame: 0,
			laneCap: LANE_CAP,
		});
		const heading = lines[1];
		// Subagent-only grand total: ↑800 ↓400 (cacheRead forced 0 → no R segment).
		expect(heading).toContain(`↑${formatTokens(800)}`);
		expect(heading).toContain(`↓${formatTokens(400)}`);
	});

	it("heading renders byte-identical (no tally segment) when no lane carries usage", () => {
		// Two lanes, neither with units nor a subagent contribution → totals.usage is
		// undefined → formatUsageTally("") → tallyStr is "" → heading unchanged (no ↑↓R).
		// This is the byte-identical-to-pre-Phase-3 path: the tally adds NOTHING when usage
		// is absent. (The degenerate empty-snapshot case returns [] before renderHeading
		// runs, so it is covered by the existing "returns []" test + this no-usage lane case.)
		const snapshot = snapshotOf([
			lane({ runId: "run-1", name: "ship", workflow: "ship" }),
			lane({ runId: "run-2", name: "build", workflow: "build" }),
		]);
		const lines = renderLaneList(identityTheme, W, snapshot, {
			active: false,
			selection: 0,
			frame: 0,
			laneCap: LANE_CAP,
		});
		const heading = lines[1];
		// Both lanes are still running (no retirement) → chip reads "Runs (2 active)"; the
		// point of this test is the ABSENCE of a tally segment, not the chip verb.
		expect(heading).toContain("Runs (2 active)");
		expect(heading).not.toContain("↑");
		expect(heading).not.toContain("↓");
	});

	it("the renderLaneRow tally sums the lane's units and its subagent contribution on a single-stage run", () => {
		// For a SINGLE-stage run (stageUsage empty), the row tally is the lane's units plus
		// the run-level subagent read. (Multi-stage runs intentionally upgrade the row from
		// "current stage" to "run so far" — covered by the folded-stage test below.)
		const snapshot = snapshotOf(
			[
				lane({
					runId: "run-1",
					name: "ship",
					workflow: "ship",
					progress: { stageName: "plan", phase: "running" },
					units: new Map<number, UnitLane>([
						[SINGLE_UNIT_KEY, unitLane({ index: SINGLE_UNIT_KEY, finalUsage: usage(1000, 500) })],
					]),
				}),
			],
			{ getSubagentUsageForRun: () => usage(300, 0) }, // subagent: +↑300
		);
		const lines = renderLaneList(identityTheme, W, snapshot, {
			active: false,
			selection: 0,
			frame: 0,
			laneCap: LANE_CAP,
		});
		const row = lines.find((l) => l.includes("plan")) ?? "";
		expect(row).toContain(`↑${formatTokens(1300)}`); // 1000 (orch) + 300 (subagent)
		expect(row).toContain(`↓${formatTokens(500)}`); // 500 (orch) + 0 (subagent)
	});

	it("row tally and grand total include FOLDED prior-stage orchestrator tokens (stageUsage)", () => {
		// The run-so-far semantics: after a stage transition folds stage A's tokens into
		// lane.stageUsage and clears the units, BOTH the heading grand total and the per-row
		// tally must still count them — the lane total reads stageUsage + units + subagents,
		// so the heading always equals the sum of renderStageBreakdown's lines.
		const snapshot = snapshotOf([
			lane({
				runId: "run-1",
				name: "ship",
				workflow: "ship",
				progress: { stageName: "build", phase: "running" },
				stageUsage: new Map([["plan", usage(1000, 500)]]), // stage A: ↑1.0k ↓500, folded
				units: new Map<number, UnitLane>([
					[SINGLE_UNIT_KEY, unitLane({ index: SINGLE_UNIT_KEY, finalUsage: usage(200, 100) })], // stage B (current): ↑200 ↓100
				]),
			}),
		]);
		const lines = renderLaneList(identityTheme, W, snapshot, {
			active: false,
			selection: 0,
			frame: 0,
			laneCap: LANE_CAP,
		});
		const heading = lines[1];
		expect(heading).toContain(`↑${formatTokens(1200)}`); // 1000 (folded plan) + 200 (live build)
		expect(heading).toContain(`↓${formatTokens(600)}`); // 500 + 100
		const row = lines.find((l) => l.includes("build")) ?? "";
		expect(row).toContain(`↑${formatTokens(1200)}`); // the row is run-so-far, not current-stage-only
		expect(row).toContain(`↓${formatTokens(600)}`);
	});
});
