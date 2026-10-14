import type { GuidanceFields } from "@hs1n/rpiv-config";
import {
	type CollapseKeySpec,
	loadJsonConfigWithLegacyFallback,
	resolveCollapseKeySpec,
	validateGuidanceFields,
} from "@hs1n/rpiv-config";

interface TodoConfig {
	guidance?: GuidanceFields;
	maxWidgetLines?: number;
	/**
	 * Key spec for the overlay collapse/expand shortcut, in the same format as
	 * pi-coding-agent keybinding ids (`modifier+key`, e.g. `ctrl+shift+t`, `alt+o`).
	 * Defaults to `"ctrl+shift+t"`. Pass `"off"` to disable the collapse shortcut
	 * entirely. Validation happens in `resolveCollapseKey`, not at load.
	 */
	collapseKey?: string;
}

/** Default content-row budget when the config is missing/invalid — the prior
 *  hardcoded value, preserved as the fallback. */
export const DEFAULT_MAX_WIDGET_LINES = 12;

/** Default collapse/expand key when `collapseKey` is missing/empty/blank/invalid. This default is
 *  the package's own; the grammar, the display casing, the resolution ladder and the off sentinel
 *  are shared with `rpiv-ask-user-question` and live in `@hs1n/rpiv-config` (see `keyspec.ts`
 *  there), because a typo in a key spec is a global input-capture bug, not a local one. */
export const DEFAULT_COLLAPSE_KEY: CollapseKeySpec = "ctrl+shift+t";

export { COLLAPSE_KEY_OFF, type CollapseKeySpec } from "@hs1n/rpiv-config";

export function loadConfig(): TodoConfig {
	return loadJsonConfigWithLegacyFallback<TodoConfig>("rpiv-todo");
}

/** Content-row budget for the overlay, read fresh on every call (per-render —
 *  no `/reload`). Mirrors warp's getHeartbeatMs minus its `=== 0` disabled
 *  sentinel: a non-number or a value below the floor of 3 falls back to the
 *  default; no ceiling. */
export function getMaxWidgetLines(): number {
	const config = loadConfig();
	const lines = config.maxWidgetLines;
	if (typeof lines !== "number" || lines < 3) return DEFAULT_MAX_WIDGET_LINES;
	return lines;
}

/** Resolve the collapse/expand key from config, read fresh on every call
 *  (per-render / per-registration — no `/reload`); mirrors getMaxWidgetLines(). Deliberately this
 *  package's own default (`ctrl+shift+t`); the trim/lowercase → sentinel → grammar → fallback
 *  ladder itself is shared. */
export function resolveCollapseKey(): CollapseKeySpec {
	return resolveCollapseKeySpec(loadConfig().collapseKey, DEFAULT_COLLAPSE_KEY);
}

export { validateGuidanceFields };
