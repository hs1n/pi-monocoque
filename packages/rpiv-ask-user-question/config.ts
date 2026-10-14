import type { GuidanceFields } from "@hs1n/rpiv-config";
import {
	type CollapseKeySpec,
	loadJsonConfigWithLegacyFallback,
	resolveCollapseKeySpec,
	validateGuidanceFields,
} from "@hs1n/rpiv-config";

/** Default collapse/expand key when `collapseKey` is missing/empty/blank/invalid. This default is
 *  the package's own (`ctrl+]`); the grammar, the display casing, the resolution ladder and the off
 *  sentinel are shared with `rpiv-todo` and live in `@hs1n/rpiv-config` (see `keyspec.ts` there),
 *  because a typo in a key spec is a global input-capture bug, not a local one. */
export const DEFAULT_COLLAPSE_KEY: CollapseKeySpec = "ctrl+]";

// Re-exported so this module stays the package's config surface: four view/state modules import the
// display formatter from `../config.js`, and the sentinel is read from here by `state/key-router`.
export { COLLAPSE_KEY_OFF, formatKeySpecForDisplay } from "@hs1n/rpiv-config";

export interface AskUserQuestionConfig {
	guidance?: GuidanceFields;
	/**
	 * Key spec for the collapse/expand shortcut, in the same format as pi-coding-agent
	 * keybinding ids (`modifier+key`, e.g. `ctrl+]`, `alt+o`, `ctrl+shift+h`). Defaults
	 * to `"ctrl+]"`. Set this to a key that is reachable on your keyboard layout — Latin
	 * American layouts (where `]` is on the shifted layer) often want `"ctrl+}"` instead.
	 * Pass `"off"` to disable the collapse shortcut entirely.
	 */
	collapseKey?: CollapseKeySpec;
}

/** Resolve the collapse/expand key from config. Deliberately this package's own default
 *  (`ctrl+]`); the trim/lowercase → sentinel → grammar → fallback ladder itself is shared. */
export function resolveCollapseKey(config: Pick<AskUserQuestionConfig, "collapseKey">): CollapseKeySpec {
	return resolveCollapseKeySpec(config.collapseKey, DEFAULT_COLLAPSE_KEY);
}

export function loadConfig(): AskUserQuestionConfig {
	return loadJsonConfigWithLegacyFallback<AskUserQuestionConfig>("rpiv-ask-user-question");
}

export { validateGuidanceFields };
