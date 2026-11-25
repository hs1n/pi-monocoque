/**
 * rpiv-models/command — /rpiv-models cascade picker command handler.
 *
 * Scope picker → key step(s) → model picker → effort picker → save
 * (saveJsonConfig) → invalidate cache (invalidateModelsConfigCache).
 *
 * Navigation: ESC moves one level UP. At the scope picker (the top) ESC exits;
 * at any inner level it returns to the previous picker, re-highlighting the
 * prior choice. This is why the flow is a back-navigable stepper (runScope)
 * rather than a straight await chain — each level must be re-enterable.
 *
 * Scope-specific logic is dispatched through the SCOPES descriptor table, whose
 * keySteps decompose key selection into one re-enterable step per path segment.
 *
 * Arguments (show / set / unset) skip the cascade. See args.ts. With no UI and
 * no arguments, the command shows the current config and the usage.
 */

import type { Api, Model } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { modelKey } from "@hs1n/rpiv-config";
import type { ModelsConfigSchema, ModelThinkingLevelValue } from "../models-config.js";
import { showFilterablePicker } from "../models-picker.js";
import { getModelsArgCompletions, runModelsArgs, showConfigAndUsage } from "./args.js";
import {
	buildEffortItems,
	buildModelItems,
	INHERIT_VALUE,
	loadRawConfig,
	RESET_LABEL,
	RESET_VALUE,
	scopeItems,
} from "./items.js";
import { floatChecked, type KeyStep, SCOPE_RESET_ALL, SCOPES, type ScopeDescriptor } from "./overrides.js";
import { resetAllOverrides, resetOverride, saveOverride } from "./writes.js";

export function registerRpivModelsCommand(pi: ExtensionAPI): void {
	pi.registerCommand("rpiv-models", {
		description: "Configure model and reasoning overrides in ~/.config/rpiv-pi/models.json",
		getArgumentCompletions: (prefix: string) => getModelsArgCompletions(prefix, pi),
		handler: async (args: string, ctx: ExtensionContext) => {
			// Arguments run without a picker, so they also work with no UI.
			if (args.trim() !== "") return runModelsArgs(args, ctx, pi);
			if (!ctx.hasUI) return showConfigAndUsage(ctx);
			await runCascade(ctx, pi);
		},
	});
}

// ---------------------------------------------------------------------------
// Cascade driver — ESC = "back one level", commit = "back to the parent list"
// ---------------------------------------------------------------------------

/** Step-internal signals, distinct from a chosen value or the "reset" sentinel. */
const BACK = Symbol("back"); // user pressed ESC — move one level up
const ABORT = Symbol("abort"); // error already surfaced via notify — exit

/**
 * Drive the scope → key(s) → model → effort cascade. The scope picker is the
 * top level: ESC there exits. Backing out of a scope's first inner level — or
 * committing a `defaults` override — returns here and re-shows the scope picker
 * (preselecting the scope you came from). The raw config is re-read each pass so
 * the scope ✓ marks reflect overrides just saved in the prior pass.
 */
async function runCascade(ctx: ExtensionContext, pi: ExtensionAPI): Promise<void> {
	let scopePreselect: string | undefined;
	while (true) {
		const raw = loadRawConfig();
		const scope = await pickScope(ctx, raw, scopePreselect);
		if (scope == null) return; // top-level ESC → exit the command
		if (scope === SCOPE_RESET_ALL) return resetAllOverrides(ctx);

		const descriptor = SCOPES[scope];
		if (!descriptor) return; // Unknown scope — shouldn't happen

		const outcome = await runScope(ctx, raw, pi, scope, descriptor);
		if (outcome !== "back") return; // aborted (error already notified) — exit
		scopePreselect = scope; // backed out, or committed a defaults override — re-show scope
	}
}

/**
 * What a frame asks the driver to do next: step forward/back, end the cascade,
 * or jump to a specific frame ({ goto }). A goto target of -1 falls below the
 * first frame, so the driver returns "back" — used by a commit to return to the
 * scope picker when the scope has no key list.
 */
type FrameResult = "advance" | "back" | "done" | { goto: number };
type Frame = () => Promise<FrameResult>;

/** Mutable state threaded through one scope's frames. */
interface CascadeState {
	raw: ModelsConfigSchema; // re-read after a commit so the returned list's ✓ are current
	segments: string[]; // key path chosen so far
	model: Model<Api> | null;
	effort: ModelThinkingLevelValue | undefined; // remembered for re-entry preselect
}

/**
 * Generic back-navigable driver. A frame returns "advance"/"back" to step
 * between frames, "done" to end the cascade, or { goto } to jump. Falling below
 * the first frame returns "back" so the caller re-shows the scope picker.
 */
async function drive(frames: Frame[]): Promise<"back" | "done"> {
	let pos = 0;
	while (pos >= 0 && pos < frames.length) {
		const res = await frames[pos]();
		if (res === "done") return "done";
		if (typeof res === "object") pos = res.goto;
		else pos += res === "back" ? -1 : 1;
	}
	return "back";
}

/**
 * Run one scope's sub-cascade: build its frame list — key sub-steps, then model,
 * then effort — and drive it. Each frame is short and single-purpose; the driver
 * owns the back-navigation.
 */
function runScope(
	ctx: ExtensionContext,
	raw: ModelsConfigSchema,
	pi: ExtensionAPI,
	scope: string,
	descriptor: ScopeDescriptor,
): Promise<"back" | "done"> {
	const keyCount = descriptor.keySteps.length;
	const state: CascadeState = { raw, segments: [], model: null, effort: undefined };
	return drive([
		...descriptor.keySteps.map((step, i) => () => keyFrame(ctx, pi, step, i, state)),
		() => modelFrame(ctx, scope, descriptor, keyCount, state),
		() => effortFrame(ctx, scope, keyCount, state),
	]);
}

/**
 * After a commit (save or per-entry reset), return to the parent of the model
 * picker so the user can configure another override — the key list (goto the
 * last key step), or the scope picker when the scope has no key steps (goto -1,
 * which the driver turns into "back"). The config snapshot is refreshed so the
 * returned list's ✓ marks reflect the commit, and the model/effort are cleared
 * so the next override starts fresh. (UX: a settings session returns to the list
 * rather than exiting — NN/g + Material's multi-select exception.)
 */
function afterCommit(state: CascadeState, keyCount: number): FrameResult {
	state.raw = loadRawConfig();
	state.model = null;
	state.effort = undefined;
	return { goto: keyCount - 1 };
}

/** Frame: choose one key-path segment via its KeyStep (prior = segments to the left). */
async function keyFrame(
	ctx: ExtensionContext,
	pi: ExtensionAPI,
	step: KeyStep,
	index: number,
	state: CascadeState,
): Promise<FrameResult> {
	const res = await step.run(ctx, state.raw, state.segments.slice(0, index), pi, state.segments[index]);
	if (res.kind === "abort") return "done";
	if (res.kind === "back") return "back";
	state.segments[index] = res.value;
	return "advance";
}

/** Frame: choose the model, or commit a per-entry reset and return to the parent list. */
async function modelFrame(
	ctx: ExtensionContext,
	scope: string,
	descriptor: ScopeDescriptor,
	keyCount: number,
	state: CascadeState,
): Promise<FrameResult> {
	const preselect = state.model ? modelKey(state.model) : undefined;
	const res = await pickModel(ctx, descriptor, state.raw, state.segments, preselect);
	if (res === ABORT) return "done";
	if (res === BACK) return "back";
	if (res === "reset") {
		resetOverride(ctx, scope, state.segments);
		return afterCommit(state, keyCount);
	}
	state.model = res;
	return "advance";
}

/**
 * Frame: choose reasoning effort, save, and return to the parent list. Non-
 * reasoning models have no effort prompt — selecting the model commits directly.
 */
async function effortFrame(
	ctx: ExtensionContext,
	scope: string,
	keyCount: number,
	state: CascadeState,
): Promise<FrameResult> {
	// The driver only reaches this frame after modelFrame set state.model; guard
	// defensively so a future frame-ordering change fails closed instead of crashing.
	const model = state.model;
	if (!model) return "done";
	const key = modelKey(model);
	if (!model.reasoning) {
		saveOverride(ctx, scope, state.segments, key, undefined);
		return afterCommit(state, keyCount);
	}
	const res = await pickEffort(ctx, model, state.effort);
	if (res === BACK) return "back";
	state.effort = res;
	saveOverride(ctx, scope, state.segments, key, res);
	return afterCommit(state, keyCount);
}

// ---------------------------------------------------------------------------
// Cascade steps — each at a single level of abstraction
// ---------------------------------------------------------------------------

/**
 * First picker: which scope to override (defaults/agents/.../presets or
 * reset-all). `preselect` re-highlights the scope the user just backed out of.
 */
function pickScope(
	ctx: ExtensionContext,
	raw: ModelsConfigSchema,
	preselect: string | undefined,
): Promise<string | null> {
	return showFilterablePicker(ctx, {
		title: "Model Overrides",
		proseLines: ["Select scope."],
		items: floatChecked(scopeItems(raw)),
		preferredValue: preselect,
	});
}

/**
 * Model picker for the chosen scope+keyPath. Returns the picked model, the
 * `"reset"` sentinel for per-entry reset, BACK when the user ESC'd (caller steps
 * up), or ABORT when there is nothing to act on (no models available or unknown
 * model — both already surfaced their own error notify). `preselect` is the
 * model key to re-highlight when re-entering (e.g. after backing out of effort).
 */
async function pickModel(
	ctx: ExtensionContext,
	descriptor: ScopeDescriptor,
	raw: ModelsConfigSchema,
	keyPath: string[],
	preselect: string | undefined,
): Promise<Model<Api> | "reset" | typeof BACK | typeof ABORT> {
	const available = ctx.modelRegistry.getAvailable();
	if (available.length === 0) {
		ctx.ui.notify("No models available (no API keys configured?).", "error");
		return ABORT;
	}
	// ✓ marks the saved config's current model; the cursor lands on the in-session
	// preselect (the model just chosen before backing) when present, else current.
	const currentKey = descriptor.getCurrentKey(raw, keyPath);
	const items = buildModelItems(available, currentKey);
	// Offer per-entry reset for every scope (defaults included) so a single
	// override can be cleared without the all-or-nothing "reset all".
	items.push({ value: RESET_VALUE, label: RESET_LABEL });

	const choice = await showFilterablePicker(ctx, {
		title: "Model",
		proseLines: ["Select model."],
		items,
		preferredValue: preselect ?? currentKey,
		escHint: "back",
	});
	if (choice == null) return BACK;
	if (choice === RESET_VALUE) return "reset";

	const picked = available.find((m) => modelKey(m) === choice);
	if (!picked) {
		ctx.ui.notify(`Model not found: ${choice}`, "error");
		return ABORT;
	}
	return picked;
}

/**
 * Effort picker (only reached for reasoning models — runScope commits
 * non-reasoning models directly). Returns BACK if the user ESC'd, undefined for
 * the "inherit" sentinel (persist NO thinking field), or the chosen level —
 * where "off" persists thinking:"off" (disable reasoning), distinct from
 * inherit. `preselect` re-highlights the prior effort on re-entry.
 */
async function pickEffort(
	ctx: ExtensionContext,
	picked: Model<Api>,
	preselect: ModelThinkingLevelValue | undefined,
): Promise<ModelThinkingLevelValue | undefined | typeof BACK> {
	const choice = await showFilterablePicker(ctx, {
		title: "Reasoning Effort",
		proseLines: [`Select effort level for ${picked.name}.`],
		items: buildEffortItems(picked),
		preferredValue: preselect ?? INHERIT_VALUE,
		escHint: "back",
	});
	if (choice == null) return BACK;
	return choice === INHERIT_VALUE ? undefined : (choice as ModelThinkingLevelValue);
}
