/**
 * command — the /advisor slash command. Arguments come first: "off" disables
 * the advisor, "<provider/model-id> [effort]" enables it (applyArgs). Without
 * arguments: no UI → print the current setting and usage; UI → model picker (buildModelItems) → no-advisor branch (applyDisable) → model
 * lookup → effort picker (buildEffortItems) → enable (applyEnable). The apply
 * helpers persist before mutating in-memory state — a save failure must never
 * leave memory ahead of disk.
 */

import type { Api, Model } from "@earendil-works/pi-ai";
import { getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem, SelectItem } from "@earendil-works/pi-tui";
import { modelKey } from "@hs1n/rpiv-config";
import { showAdvisorPicker, showEffortPicker } from "../advisor-ui.js";
import { saveAdvisorConfig } from "./config.js";
import { reconcileAdvisorTool } from "./handlers.js";
import {
	ADVISOR_TOOL_NAME,
	CHECKMARK,
	DEFAULT_EFFORT,
	EFFORT_ORDINAL,
	ERR_TOO_MANY_ARGS,
	errEffortNotSupported,
	errInvalidEffort,
	errSelectionNotFound,
	errUnknownAdvisorModel,
	type GradedEffort,
	MSG_ADVISOR_DISABLED,
	MSG_EFFORT_NOT_SET,
	MSG_PERSIST_FAILED,
	msgAdvisorCurrent,
	msgAdvisorEnabled,
	msgAdvisorEnabledInactive,
	NO_ADVISOR_VALUE,
	OFF_VALUE,
	RECOMMENDED_EFFORT_SUFFIX,
} from "./messages.js";
import { isExecutorBlocked } from "./policy.js";
import { getAdvisorEffort, getAdvisorModel, setAdvisorEffort, setAdvisorModel } from "./state.js";

// Mirror: packages/rpiv-pi/extensions/rpiv-core/rpiv-models/items.ts
// buildModelItems — structural twin kept in a separate package by the
// zero-cross-imports contract; evolve model-picker semantics together.
function buildModelItems(availableModels: Model<Api>[], currentKey: string | undefined): SelectItem[] {
	const items: SelectItem[] = availableModels.map((m) => {
		const key = modelKey(m);
		const check = key === currentKey ? CHECKMARK : "";
		return { value: key, label: `${m.name}  (${m.provider})${check}` };
	});
	items.push({
		value: NO_ADVISOR_VALUE,
		label: currentKey === undefined ? `No advisor${CHECKMARK}` : "No advisor",
	});
	return items;
}

// Mirror: packages/rpiv-pi/extensions/rpiv-core/rpiv-models/items.ts
// buildEffortItems — same filter-in/map-out shape, different sentinels and
// persist target; evolve level-picker semantics together.
function buildEffortItems(picked: Model<Api>): SelectItem[] {
	// Intersect with EFFORT_ORDINAL (which excludes "off") so the picker can
	// never offer — hence saveAdvisorConfig can never persist — a level that
	// minEffort blocklist comparisons don't rank.
	const levels = getSupportedThinkingLevels(picked).filter((level): level is GradedEffort =>
		EFFORT_ORDINAL.includes(level as GradedEffort),
	);
	return [
		// "off (no reasoning sent)" ≠ /rpiv-models' "off (disable reasoning)":
		// this row sends NO reasoning option; /rpiv-models persists thinking:"off".
		{ value: OFF_VALUE, label: "off (no reasoning sent)" },
		...levels.map((level) => ({
			value: level,
			label: level === DEFAULT_EFFORT ? `${level}${RECOMMENDED_EFFORT_SUFFIX}` : level,
		})),
	];
}

// Disable path — persist BEFORE mutating in-memory state so a save failure
// can't strand "model=undefined + tool still registered". The strip
// is unconditional-on-presence (no advisor at all), so it stays inline rather
// than routing through reconcileAdvisorTool's blocked-conditional path.
function applyDisable(pi: ExtensionAPI, ctx: ExtensionContext): void {
	if (!saveAdvisorConfig(undefined, undefined)) {
		ctx.ui.notify(MSG_PERSIST_FAILED, "error");
		return;
	}
	setAdvisorModel(undefined);
	setAdvisorEffort(undefined);
	const active = pi.getActiveTools();
	if (active.includes(ADVISOR_TOOL_NAME)) {
		pi.setActiveTools(active.filter((n) => n !== ADVISOR_TOOL_NAME));
	}
	ctx.ui.notify(MSG_ADVISOR_DISABLED, "info");
}

// Enable path — persist first, set in-memory state, activate via
// reconcileAdvisorTool (which re-reads the active-tool list post-effort-picker-
// await), and notify. Silent reconcile — the enable/inactive notify is the
// single trailing notify call here.
function applyEnable(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	picked: Model<Api>,
	effort: GradedEffort | undefined,
): void {
	if (!saveAdvisorConfig(modelKey(picked), effort)) {
		ctx.ui.notify(MSG_PERSIST_FAILED, "error");
		return;
	}
	setAdvisorEffort(effort);
	setAdvisorModel(picked);

	const blocked = isExecutorBlocked(ctx, pi.getThinkingLevel());
	reconcileAdvisorTool(pi, ctx, { blocked });
	ctx.ui.notify(
		blocked ? msgAdvisorEnabledInactive(modelKey(picked), effort) : msgAdvisorEnabled(modelKey(picked), effort),
		"info",
	);
}

// Argument words. "off" as the first word disables the advisor (the picker's
// "No advisor" row). "off" as the effort word sends no reasoning (OFF_VALUE).
const DISABLE_ARG = "off";
const OFF_EFFORT_ARG = "off";

// Effort words that the command accepts for a model: the picker's effort rows,
// with OFF_VALUE shown as "off". Empty for a model without reasoning.
function effortArgs(picked: Model<Api>): string[] {
	if (!picked.reasoning) return [];
	return buildEffortItems(picked).map((item) => (item.value === OFF_VALUE ? OFF_EFFORT_ARG : item.value));
}

// Argument path. Each error notifies and returns before any save, so an
// invalid argument never changes the state. A reasoning model without an
// effort word behaves like Esc at the effort picker (no explicit effort).
function applyArgs(pi: ExtensionAPI, ctx: ExtensionContext, words: string[]): void {
	const [modelArg, effortArg, ...rest] = words;
	if (rest.length > 0 || (modelArg === DISABLE_ARG && effortArg !== undefined)) {
		ctx.ui.notify(ERR_TOO_MANY_ARGS, "error");
		return;
	}
	if (modelArg === DISABLE_ARG) {
		applyDisable(pi, ctx);
		return;
	}

	const availableModels = ctx.modelRegistry.getAvailable();
	const picked = availableModels.find((m) => modelKey(m) === modelArg);
	if (!picked) {
		ctx.ui.notify(errUnknownAdvisorModel(modelArg, [DISABLE_ARG, ...availableModels.map(modelKey)]), "error");
		return;
	}

	if (effortArg === undefined) {
		if (picked.reasoning) ctx.ui.notify(MSG_EFFORT_NOT_SET, "info");
		applyEnable(pi, ctx, picked, undefined);
		return;
	}
	const validEfforts = effortArgs(picked);
	if (validEfforts.length === 0) {
		ctx.ui.notify(errEffortNotSupported(modelKey(picked)), "error");
		return;
	}
	if (!validEfforts.includes(effortArg)) {
		ctx.ui.notify(errInvalidEffort(effortArg, modelKey(picked), validEfforts), "error");
		return;
	}
	applyEnable(pi, ctx, picked, effortArg === OFF_EFFORT_ARG ? undefined : (effortArg as GradedEffort));
}

// Completions for the argument text. The host replaces the full argument text
// with the item value, so an effort item carries the model word too.
function completeArgs(prefix: string, models: Model<Api>[]): AutocompleteItem[] | null {
	const words = prefix.trimStart().split(/\s+/);
	let items: AutocompleteItem[];
	if (words.length <= 1) {
		const first = words[0] ?? "";
		items = [DISABLE_ARG, ...models.map(modelKey)]
			.filter((value) => value.startsWith(first))
			.map((value) => ({ value, label: value }));
	} else if (words.length === 2) {
		const [modelArg = "", effortPrefix = ""] = words;
		const picked = models.find((m) => modelKey(m) === modelArg);
		items = picked
			? effortArgs(picked)
					.filter((effort) => effort.startsWith(effortPrefix))
					.map((effort) => ({ value: `${modelArg} ${effort}`, label: effort }))
			: [];
	} else {
		items = [];
	}
	return items.length > 0 ? items : null;
}

export function registerAdvisorCommand(pi: ExtensionAPI): void {
	// Completions get no context. Keep the registry of the last session so
	// that they can offer the model keys.
	let registry: ExtensionContext["modelRegistry"] | undefined;
	pi.on("session_start", async (_event, ctx) => {
		registry = ctx.modelRegistry;
	});

	pi.registerCommand("advisor", {
		description: "Configure the advisor model for the advisor-strategy pattern",
		getArgumentCompletions: (prefix) => completeArgs(prefix, registry?.getAvailable() ?? []),
		handler: async (args, ctx) => {
			registry = ctx.modelRegistry;
			const words = args
				.trim()
				.split(/\s+/)
				.filter((w) => w.length > 0);
			if (words.length > 0) {
				applyArgs(pi, ctx, words);
				return;
			}
			if (!ctx.hasUI) {
				const current = getAdvisorModel();
				ctx.ui.notify(msgAdvisorCurrent(current ? modelKey(current) : undefined, getAdvisorEffort()), "info");
				return;
			}

			const availableModels = ctx.modelRegistry.getAvailable();
			const current = getAdvisorModel();
			const currentKey = current ? modelKey(current) : undefined;

			const choice = await showAdvisorPicker(ctx, buildModelItems(availableModels, currentKey));
			if (!choice) return;

			if (choice === NO_ADVISOR_VALUE) {
				applyDisable(pi, ctx);
				return;
			}

			const picked = availableModels.find((m) => modelKey(m) === choice);
			if (!picked) {
				ctx.ui.notify(errSelectionNotFound(choice), "error");
				return;
			}

			// Effort picker — only for reasoning-capable models
			let effortChoice: GradedEffort | undefined;
			if (picked.reasoning) {
				const effortResult = await showEffortPicker(
					ctx,
					buildEffortItems(picked),
					getAdvisorEffort(),
					DEFAULT_EFFORT,
				);
				if (!effortResult) {
					// Esc at the effort step keeps the model selection — cancelling
					// one step never discards prior choices (the invariant shared
					// with the /rpiv-models stepper). The divergence is deliberate:
					// that twin backs up without writing, while here the enable
					// proceeds and PERSISTS with no explicit effort (model default),
					// announced by this notify before the write.
					ctx.ui.notify(MSG_EFFORT_NOT_SET, "info");
				} else {
					effortChoice = effortResult === OFF_VALUE ? undefined : (effortResult as GradedEffort);
				}
			}

			applyEnable(pi, ctx, picked, effortChoice);
		},
	});
}
