/**
 * rpiv-models/writes — models.json writes for /rpiv-models.
 *
 * Each write loads the config fresh, changes it, saves it, and then notifies.
 * The picker cascade (command.ts) and the argument path (args.ts) share these
 * functions, so both paths write the file the same way.
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { loadJsonConfigWithLegacyFallback, saveJsonConfig } from "@hs1n/rpiv-config";
import {
	CONFIG_PATH,
	invalidateModelsConfigCache,
	type ModelsConfigSchema,
	type ModelThinkingLevelValue,
} from "../models-config.js";
import {
	applyOverride,
	MSG_RESET_ALL,
	MSG_RESET_ALL_BODY,
	MSG_RESET_ALL_CANCELLED,
	MSG_RESET_ALL_TITLE,
	MSG_SAVE_FAILED,
	removeOverride,
	SCOPE_DEFAULTS,
} from "./overrides.js";

/** Clear every override after an explicit confirm (destructive + irreversible). */
export async function resetAllOverrides(ctx: ExtensionContext): Promise<void> {
	// Gate behind a confirm dialog, mirroring /rpiv-setup's prune (the repo's
	// established destructive-action pattern).
	const confirmed = await ctx.ui.confirm(MSG_RESET_ALL_TITLE, MSG_RESET_ALL_BODY);
	if (!confirmed) {
		ctx.ui.notify(MSG_RESET_ALL_CANCELLED, "info");
		return;
	}
	if (persist(ctx, {})) ctx.ui.notify(MSG_RESET_ALL, "info");
}

/** Remove a single scope+keyPath override, reporting honestly when there was none. */
export function resetOverride(ctx: ExtensionContext, scope: string, keyPath: string[]): void {
	const label = scopeLabel(scope, keyPath);
	const fresh = loadJsonConfigWithLegacyFallback<ModelsConfigSchema>("rpiv-pi", "models.json");
	const { next, removed } = removeOverride(fresh, scope, keyPath);
	if (!removed) {
		// Nothing to remove — report honestly, skip the no-op write + cache reset.
		ctx.ui.notify(`No override set for ${label}.`, "info");
		return;
	}
	if (persist(ctx, next)) ctx.ui.notify(`Removed ${label}.`, "info");
}

/** Write a model (+ optional effort) override for the chosen scope+keyPath. */
export function saveOverride(
	ctx: ExtensionContext,
	scope: string,
	keyPath: string[],
	model: string,
	effort: ModelThinkingLevelValue | undefined,
): void {
	const fresh = loadJsonConfigWithLegacyFallback<ModelsConfigSchema>("rpiv-pi", "models.json");
	const next = applyOverride(fresh, scope, keyPath, { model, thinking: effort });
	if (persist(ctx, next)) {
		ctx.ui.notify(`Saved ${scopeLabel(scope, keyPath)} → ${model}${effort ? ` (${effort})` : ""}`, "info");
	}
}

/**
 * Persist a config to disk and invalidate the cache on success. Returns false
 * (after notifying) on write failure — the cache is left untouched so a failed
 * save never silently drops the in-memory state.
 */
function persist(ctx: ExtensionContext, next: ModelsConfigSchema): boolean {
	if (!saveJsonConfig(CONFIG_PATH, next)) {
		ctx.ui.notify(MSG_SAVE_FAILED, "error");
		return false;
	}
	invalidateModelsConfigCache();
	return true;
}

/** Human-readable label for a scope+keyPath (defaults has no key). */
export function scopeLabel(scope: string, keyPath: string[]): string {
	return scope === SCOPE_DEFAULTS ? scope : `${scope}/${keyPath.join("/")}`;
}
