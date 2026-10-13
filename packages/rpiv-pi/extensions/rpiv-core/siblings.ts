/**
 * Declarative registry of rpiv-pi's sibling Pi plugins.
 *
 * Single source of truth for: presence detection (package-checks.ts),
 * session_start "missing plugins" warning (session-hooks.ts), and
 * /rpiv-setup installer (setup-command.ts). Add a sibling here and every
 * consumer picks it up automatically.
 *
 * Detection (package-checks.ts) is the union of a regex over the active Pi
 * settings file and what is actually loaded: `matches` is also tested against
 * the source path of every loaded tool / extension command, and `marker` names
 * the presence slot of a sibling that registers neither (#216). No runtime
 * import of sibling packages (keeps rpiv-core pure-orchestrator).
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export interface SiblingPlugin {
	/** Install spec passed to `pi install`. `npm:`-prefixed — see `resolveInstallSpec`. */
	readonly pkg: string;
	/**
	 * Case-insensitive regex that matches the package in settings.json AND in the
	 * source path of its loaded extension (e.g. `…/@hs1n/rpiv-todo/index.ts`
	 * bundled inside another package).
	 */
	readonly matches: RegExp;
	/**
	 * `Symbol.for` key the sibling sets on `globalThis` when it loads — only for a
	 * sibling with no tool or command to find by source path. Keep in sync with
	 * the sibling's own constant.
	 */
	readonly marker?: string;
	/** What the sibling provides — shown in /rpiv-setup confirmation and reports. */
	readonly provides: string;
}

/**
 * This repo's `packages/` directory, resolved from this module's own location
 * (`packages/rpiv-pi/extensions/rpiv-core/`). Identical in a checkout and in a git
 * install (Pi clones the repo, keeping the layout).
 */
const REPO_PACKAGES_DIR = fileURLToPath(new URL("../../../../packages/", import.meta.url));

/**
 * The spec `pi install` should be handed for a registry entry.
 *
 * This repo has **no publish path**, so `@hs1n/rpiv-*` is module identity, not a registry
 * entry — `npm:@hs1n/rpiv-todo` resolves nowhere. When the sibling's own package directory
 * is present next to this one (always, in this repo), install it by local path: Pi records
 * the path rather than copying, so `/reload` picks up edits. Anything else — a third-party
 * dependency such as `@tintinweb/pi-subagents`, or a copy of rpiv-pi installed standalone
 * with no sibling dirs beside it — keeps its npm spec, which is upstream's behavior.
 */
export function resolveInstallSpec(pkg: string): string {
	const match = /^npm:@hs1n\/(rpiv-[a-z0-9-]+)$/.exec(pkg);
	if (!match) return pkg;
	const dir = join(REPO_PACKAGES_DIR, match[1]);
	return existsSync(join(dir, "package.json")) ? dir : pkg;
}

export const SIBLINGS: readonly SiblingPlugin[] = [
	{
		pkg: "npm:@tintinweb/pi-subagents",
		// Detect both the upstream tintinweb fork and the API-compatible
		// @gotgenes fork; pkg stays upstream so /rpiv-setup installs that.
		matches: /@(tintinweb|gotgenes)\/pi-subagents(?![-\w])/i,
		provides: "Agent / get_subagent_result / steer_subagent tools (tintinweb or gotgenes fork)",
	},
	{
		pkg: "npm:@hs1n/rpiv-ask-user-question",
		matches: /rpiv-ask-user-question/i,
		provides: "ask_user_question tool",
	},
	{
		pkg: "npm:@hs1n/rpiv-todo",
		matches: /rpiv-todo/i,
		provides: "todo tool + /todos command + overlay widget",
	},
	{
		pkg: "npm:@hs1n/rpiv-advisor",
		matches: /rpiv-advisor/i,
		provides: "advisor tool + /advisor command",
	},
	{
		pkg: "npm:@hs1n/rpiv-i18n",
		matches: /rpiv-i18n(?![-\w])/i,
		provides: "i18n SDK for Pi extensions — /languages command + --locale flag + registerStrings/scope/tr API",
	},
	{
		pkg: "npm:@hs1n/rpiv-web-tools",
		matches: /rpiv-web-tools/i,
		provides: "web_search + web_fetch tools + /web-tools",
	},
	{
		pkg: "npm:@hs1n/rpiv-args",
		matches: /rpiv-args(?![-\w])/i,
		// Hooks events only — nothing to find by source path (`LOADED_MARKER`, rpiv-args/index.ts).
		marker: "@hs1n/rpiv-args:loaded",
		provides: "skill-argument resolver — substitutes $N/$ARGUMENTS in skill bodies",
	},
	{
		pkg: "npm:@hs1n/rpiv-workflow",
		matches: /rpiv-workflow(?![-\w])/i,
		provides: "/wf command + workflow runner — chain skills into typed multi-stage pipelines",
	},
];

/**
 * Deprecated sibling packages that `/rpiv-setup` actively prunes from
 * the active Pi settings file (so upgraders don't end up with superseded
 * libraries loaded alongside their replacements). Single source of truth
 * for `prune-legacy-siblings.ts`.
 */
export interface LegacyPackage {
	/** Human-readable label used in the prune notify message. */
	readonly label: string;
	/** Case-insensitive regex matched against settings.json `packages[]` entries. */
	readonly matches: RegExp;
	/** Short reason — useful when debugging; not user-facing. */
	readonly reason: string;
}

export const LEGACY_SIBLINGS: readonly LegacyPackage[] = [
	{
		// nicobailon's pi-subagents fork was the SIBLINGS[0] package between
		// rpiv-pi 0.12.0 and 0.13.x. Reverted to @tintinweb/pi-subagents in
		// rpiv-pi 1.0.0 once tintinweb resumed active maintenance and shipped
		// 0.6.x against pi-coding-agent ^0.70.5.
		label: "pi-subagents",
		matches: /(^|[^\w/-])pi-subagents(?![-\w])/i,
		reason: "superseded by @tintinweb/pi-subagents (resumed maintenance) in rpiv-pi 1.0.0",
	},
];
