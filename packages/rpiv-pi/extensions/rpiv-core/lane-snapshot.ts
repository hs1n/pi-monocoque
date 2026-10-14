/**
 * lane-snapshot — the one place the lane registry is read for rendering.
 *
 * Both lane surfaces (the ambient dock and the stepped-in console) render the SAME rows, and
 * they must keep doing so byte-for-byte. That guarantee used to rest on each renderer reaching
 * into the process-global registry mid-render: `lane-list.ts` called a different registry read
 * for every glyph, so one render could observe two different states (a lane evicted between
 * `listLanesForDisplay()` and the per-unit needs-input lookup), and every render test had to
 * build a registry before it could assert one line of output.
 *
 * This module reads the registry once per render and hands the renderers a value. Two folds that
 * lived in prose now live in code: the token fold (the per-row tally and the run grand total used
 * to fold the same three sources twice, kept in agreement by a comment) happens once here, and
 * each unit's effective usage — a live `getUsage()` call during a run — is read once per frame
 * instead of once per consumer.
 *
 * `stageLinesFor` stays lazy on purpose: the console computes the per-stage breakdown only when
 * `s` is expanded, while a render fires every `SPIN_INTERVAL_MS` (160ms), so folding every run's
 * stages eagerly would turn a keypress into a per-frame cost.
 */

import type { RunRecap } from "@hs1n/rpiv-workflow";
import { addLaneUsage, type LaneUsage } from "./lane-usage.js";
import { listLanes, listLanesForDisplay, unitUsage } from "./run-lane-registry.js";
import type { DisplayRow, LaneEntry, UnitLane } from "./run-lane-types.js";
import { getSubagentUsageForRun, getSubagentUsageForStage } from "./subagent-usage.js";

/**
 * The narrow read port this module needs — four reads, not the registry's twenty. Everything
 * else a row needs (needs-input, per-unit usage) is derived from the entries these reads return,
 * which is what keeps the assembly testable against a literal: a caller can hand it plain
 * objects, with no process-global state and no reset between tests.
 */
export interface LaneReader {
	listLanes(): LaneEntry[];
	listLanesForDisplay(): DisplayRow[];
	getSubagentUsageForRun(runId: string): LaneUsage | undefined;
	getSubagentUsageForStage(runId: string, stageName: string): LaneUsage | undefined;
}

/** One resolved per-stage line — the usage may be undefined, and the renderer skips a stage
 *  whose tally is empty (a stage that ran without tokens has nothing to show). */
export interface LaneStageLine {
	readonly name: string;
	readonly usage?: LaneUsage;
}

/** Run-level facts the heading needs: the counts it branches on, the age anchor for the
 *  needs-input shout, and the grand total. */
export interface LaneSnapshotTotals {
	readonly lanes: number;
	readonly active: number;
	readonly needsInput: number;
	/** Oldest `needsInputSince` among lanes awaiting input; undefined when none carries one (the
	 *  caller then renders age 0, matching the pre-snapshot `?? now` fallback). */
	readonly oldestNeedsInputSince?: number;
	readonly usage?: LaneUsage;
}

/** A display row plus the registry-derived facts the renderer used to look up itself. */
export type LaneSnapshotRow =
	| { readonly kind: "lane"; readonly lane: LaneEntry; readonly needsInput: boolean; readonly usage?: LaneUsage }
	| {
			readonly kind: "unit";
			readonly lane: LaneEntry;
			readonly unit: UnitLane;
			readonly needsInput: boolean;
			readonly usage?: LaneUsage;
	  };

/** The two row shapes, narrowed — a renderer that handles exactly one kind names it. */
export type LaneRowSnapshot = Extract<LaneSnapshotRow, { kind: "lane" }>;
export type UnitRowSnapshot = Extract<LaneSnapshotRow, { kind: "unit" }>;

export interface LaneSnapshot {
	readonly rows: readonly LaneSnapshotRow[];
	readonly totals: LaneSnapshotTotals;
	/** Per-stage lines for one run, folded through the same sources the row tally uses. */
	stageLinesFor(runId: string): LaneStageLine[];
	/** The end-of-run recap for one run — the console's post-mortem line. */
	recapFor(runId: string): RunRecap | undefined;
}

/** True when ANY of a lane's units has a deferred UI request. Derived from the entry the reader
 *  already returned, so the assembly needs no second registry read to know it. */
function anyUnitNeedsInput(entry: LaneEntry): boolean {
	for (const unit of entry.units.values()) if (unit.pendingInput.length > 0) return true;
	return false;
}

/**
 * The production binding of the port: the process-global registry. A plain object of function
 * references, so a test hands `buildLaneSnapshot` literals instead without touching module state
 * — no singleton to mock and no reset to wire into `test/setup.ts`.
 */
export const registryLaneReader: LaneReader = {
	listLanes: () => listLanes(),
	listLanesForDisplay: () => listLanesForDisplay(),
	getSubagentUsageForRun: (runId) => getSubagentUsageForRun(runId),
	getSubagentUsageForStage: (runId, stageName) => getSubagentUsageForStage(runId, stageName),
};

/**
 * Sum the four token dimensions across a lane's units, calling `usageAt` per unit so the caller
 * can memoize. Kept as its own arithmetic (rather than folded through `addLaneUsage`) because a
 * unit's usage carries no `percent` to drop and its `cost` must accumulate only when present.
 */
function sumUnits(entry: LaneEntry, usageAt: (index: number) => LaneUsage | undefined): LaneUsage | undefined {
	let input = 0;
	let output = 0;
	let cacheRead = 0;
	let cacheWrite = 0;
	let cost = 0;
	let hasCost = false;
	let any = false;
	for (const unit of entry.units.values()) {
		const u = usageAt(unit.index);
		if (!u) continue;
		any = true;
		input += u.input;
		output += u.output;
		cacheRead += u.cacheRead;
		cacheWrite += u.cacheWrite;
		if (u.cost !== undefined) {
			cost += u.cost;
			hasCost = true;
		}
	}
	if (!any) return undefined;
	const result: LaneUsage = { input, output, cacheRead, cacheWrite, total: input + output + cacheRead + cacheWrite };
	if (hasCost) result.cost = cost;
	return result;
}

/**
 * Read the registry once and resolve everything the renderers need.
 *
 * The single definition of "a lane's tokens" is the run-so-far total, unified from three
 * disjoint sources: folded prior-stage orchestrator tokens (`entry.stageUsage` — `foldStageUsage`
 * moves a stage's tokens there BEFORE `clearUnitLanes` empties `units`, so the two never overlap),
 * the current stage's live/retained orchestrator units, and the run's recorded subagent
 * contribution. The per-row tally, the run grand total and the per-stage lines all read THIS
 * result, so they cannot disagree.
 */
export function buildLaneSnapshot(reader: LaneReader): LaneSnapshot {
	const displayRows = reader.listLanesForDisplay();
	const lanes = reader.listLanes();

	// One read per unit per frame: the sub-row tally and its parent lane's total used to call
	// `unitUsage` separately, and `unitUsage` hits a live session's `getUsage()`.
	const perLaneUnitUsages = new Map<string, Map<number, LaneUsage | undefined>>();
	const unitUsageFor = (entry: LaneEntry, index: number): LaneUsage | undefined => {
		let perUnit = perLaneUnitUsages.get(entry.runId);
		if (!perUnit) {
			perUnit = new Map();
			perLaneUnitUsages.set(entry.runId, perUnit);
		}
		if (!perUnit.has(index)) perUnit.set(index, unitUsage(entry.units.get(index)));
		return perUnit.get(index);
	};

	const perLaneTotals = new Map<string, LaneUsage | undefined>();
	const laneTotal = (entry: LaneEntry): LaneUsage | undefined => {
		if (!perLaneTotals.has(entry.runId)) {
			let folded: LaneUsage | undefined;
			for (const usage of entry.stageUsage.values()) folded = addLaneUsage(folded, usage);
			const units = sumUnits(entry, (index) => unitUsageFor(entry, index));
			perLaneTotals.set(
				entry.runId,
				addLaneUsage(addLaneUsage(folded, units), reader.getSubagentUsageForRun(entry.runId)),
			);
		}
		return perLaneTotals.get(entry.runId);
	};

	const rows: LaneSnapshotRow[] = displayRows.map((row) =>
		row.kind === "lane"
			? { kind: "lane", lane: row.lane, needsInput: anyUnitNeedsInput(row.lane), usage: laneTotal(row.lane) }
			: {
					kind: "unit",
					lane: row.lane,
					unit: row.unit,
					needsInput: row.unit.pendingInput.length > 0,
					usage: unitUsageFor(row.lane, row.unit.index),
				},
	);

	let usage: LaneUsage | undefined;
	let active = 0;
	let needsInput = 0;
	let oldestNeedsInputSince: number | undefined;
	for (const lane of lanes) {
		usage = addLaneUsage(usage, laneTotal(lane));
		if (lane.status === "running") active++;
		if (anyUnitNeedsInput(lane)) {
			needsInput++;
			const since = lane.needsInputSince;
			if (since !== undefined && (oldestNeedsInputSince === undefined || since < oldestNeedsInputSince)) {
				oldestNeedsInputSince = since;
			}
		}
	}

	return {
		rows,
		totals: { lanes: lanes.length, active, needsInput, oldestNeedsInputSince, usage },
		stageLinesFor(runId: string): LaneStageLine[] {
			const lane = lanes.find((l) => l.runId === runId);
			if (!lane) return [];
			const currentName = lane.progress?.stageName;
			// Execution order: folded stages in insertion order, then the current stage if new.
			const names: string[] = [...lane.stageUsage.keys()];
			if (currentName && !names.includes(currentName)) names.push(currentName);
			return names.map((name) => ({
				name,
				usage: addLaneUsage(
					addLaneUsage(
						lane.stageUsage.get(name),
						name === currentName ? sumUnits(lane, (index) => unitUsageFor(lane, index)) : undefined,
					),
					reader.getSubagentUsageForStage(runId, name),
				),
			}));
		},
		recapFor(runId: string): RunRecap | undefined {
			return lanes.find((l) => l.runId === runId)?.recap;
		},
	};
}
