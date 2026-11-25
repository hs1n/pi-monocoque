/**
 * /rpiv-setup — installs any SIBLINGS neither declared in the active Pi settings
 * file nor already loaded (bundled in another package, a project install — #216:
 * installing those again makes both copies register the same tools)
 * and prunes deprecated entries (e.g. the unscoped `npm:pi-subagents` from
 * the rpiv-pi 0.12.x → 0.14.0 line). Both mutations are previewed in the
 * confirmation dialog and only executed after the user agrees.
 *
 * Arguments:
 *   /rpiv-setup        With a UI: preview, confirm, then apply.
 *                      With no UI: list the changes and the command to apply them.
 *   /rpiv-setup --yes  Apply the changes with no confirmation. Works with no UI.
 *
 * Serial `pi install <pkg>` loop via spawnPiInstall (Windows-safe).
 * Reports succeeded/failed split; prompts the user to restart Pi on success.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readLoadedSiblingSources } from "./loaded-siblings.js";
import { findMissingSiblings } from "./package-checks.js";
import { spawnPiInstall } from "./pi-installer.js";
import { findLegacySiblings, pruneLegacySiblings } from "./prune-legacy-siblings.js";
import type { SiblingPlugin } from "./siblings.js";
import { resolveInstallSpec } from "./siblings.js";
import { getPiAgentSettingsPath, toErrorMessage } from "./utils.js";

const INSTALL_TIMEOUT_MS = 120_000;
const STDERR_SNIPPET_CHARS = 300;

export const SETUP_YES_FLAG = "--yes";
const MSG_USAGE = `Usage: /rpiv-setup [${SETUP_YES_FLAG}]`;
const MSG_APPLY_HINT = `Run \`/rpiv-setup ${SETUP_YES_FLAG}\` to apply these changes.`;
const MSG_NOTHING_TO_DO = "All rpiv-pi sibling dependencies already installed.";
const MSG_CANCELLED = "/rpiv-setup cancelled";
const MSG_CONFIRM_TITLE = "Apply rpiv-pi setup changes?";
const MSG_RESTART = "Restart your Pi session to load the newly-installed extensions.";

const msgUnknownArg = (arg: string) => `Unknown argument: ${arg}. ${MSG_USAGE}`;
const msgInstalling = (pkg: string) => `Installing ${pkg}…`;
const msgInstalledLine = (pkgs: string[]) => `✓ Installed: ${pkgs.join(", ")}`;
const msgFailedHeader = () => `✗ Failed:`;
const msgFailedLine = (pkg: string, err: string) => `  ${pkg}: ${err}`;
const msgLegacyPruned = (entries: string[]) =>
	`Removed legacy subagent library from settings.json: ${entries.join(", ")}. Run \`pi uninstall\` to free disk space, then restart Pi.`;

type UI = {
	notify: (msg: string, sev: "info" | "warning" | "error") => void;
	confirm: (title: string, body: string) => Promise<boolean>;
};

/** Lines that list the pending installs and the legacy entries to remove. */
function buildPlanLines(missing: SiblingPlugin[], legacyEntries: string[]): string[] {
	const lines: string[] = ["rpiv-pi will apply the following changes:", ""];
	if (missing.length > 0) {
		lines.push("Install via `pi install`:");
		for (const m of missing) lines.push(`  • ${resolveInstallSpec(m.pkg)}  (required — provides ${m.provides})`);
		lines.push("");
	}
	const settingsPath = getPiAgentSettingsPath();
	if (legacyEntries.length > 0) {
		lines.push(`Remove from \`${settingsPath}\` (deprecated):`);
		for (const entry of legacyEntries) lines.push(`  • ${entry}`);
		lines.push("");
	}
	return lines;
}

function buildConfirmBody(missing: SiblingPlugin[], legacyEntries: string[]): string {
	const lines = buildPlanLines(missing, legacyEntries);
	lines.push(`Your \`${getPiAgentSettingsPath()}\` will be updated. Proceed?`);
	return lines.join("\n");
}

/** No UI and no argument: list the changes and the command that applies them. */
function buildApplyHint(missing: SiblingPlugin[], legacyEntries: string[]): string {
	return [...buildPlanLines(missing, legacyEntries), MSG_APPLY_HINT].join("\n");
}

export function registerSetupCommand(pi: ExtensionAPI): void {
	pi.registerCommand("rpiv-setup", {
		description: "Install rpiv-pi's sibling extension plugins",
		getArgumentCompletions: (prefix) =>
			SETUP_YES_FLAG.startsWith(prefix.trim())
				? [{ value: SETUP_YES_FLAG, label: SETUP_YES_FLAG, description: "Apply the changes with no confirmation" }]
				: null,
		handler: (args, ctx) => handleSetupCommand(args, ctx, pi),
	});
}

async function handleSetupCommand(
	args: string,
	ctx: { hasUI: boolean; ui: UI },
	pi: Pick<ExtensionAPI, "getAllTools" | "getCommands">,
): Promise<void> {
	const arg = args.trim();
	if (arg !== "" && arg !== SETUP_YES_FLAG) {
		ctx.ui.notify(msgUnknownArg(arg), "error");
		return;
	}
	const skipConfirm = arg === SETUP_YES_FLAG;

	const missing = findMissingSiblings(readLoadedSiblingSources(pi));
	const legacyEntries = findLegacySiblings();
	if (missing.length === 0 && legacyEntries.length === 0) {
		ctx.ui.notify(MSG_NOTHING_TO_DO, "info");
		return;
	}

	if (!skipConfirm) {
		if (!ctx.hasUI) {
			ctx.ui.notify(buildApplyHint(missing, legacyEntries), "info");
			return;
		}
		const confirmed = await ctx.ui.confirm(MSG_CONFIRM_TITLE, buildConfirmBody(missing, legacyEntries));
		if (!confirmed) {
			ctx.ui.notify(MSG_CANCELLED, "info");
			return;
		}
	}

	if (legacyEntries.length > 0) {
		const prune = pruneLegacySiblings();
		if (prune.pruned.length > 0) {
			ctx.ui.notify(msgLegacyPruned(prune.pruned), "info");
		}
	}

	if (missing.length === 0) return;

	const { succeeded, failed } = await installMissing(ctx.ui, missing);
	ctx.ui.notify(buildReport(succeeded, failed), failed.length > 0 ? "warning" : "info");
}

async function installMissing(
	ui: UI,
	missing: SiblingPlugin[],
): Promise<{ succeeded: string[]; failed: Array<{ pkg: string; error: string }> }> {
	const succeeded: string[] = [];
	const failed: Array<{ pkg: string; error: string }> = [];
	for (const { pkg } of missing) {
		// Local path for this repo's own siblings (no publish path), npm spec otherwise.
		const spec = resolveInstallSpec(pkg);
		ui.notify(msgInstalling(spec), "info");
		try {
			const result = await spawnPiInstall(spec, INSTALL_TIMEOUT_MS);
			if (result.code === 0) {
				succeeded.push(spec);
			} else {
				failed.push({
					pkg: spec,
					error: (result.stderr || result.stdout || `exit ${result.code}`).trim().slice(0, STDERR_SNIPPET_CHARS),
				});
			}
		} catch (err) {
			failed.push({ pkg: spec, error: toErrorMessage(err) });
		}
	}
	return { succeeded, failed };
}

function buildReport(succeeded: string[], failed: Array<{ pkg: string; error: string }>): string {
	const lines: string[] = [];
	if (succeeded.length > 0) lines.push(msgInstalledLine(succeeded));
	if (failed.length > 0) {
		lines.push(msgFailedHeader());
		for (const { pkg, error } of failed) lines.push(msgFailedLine(pkg, error));
	}
	if (succeeded.length > 0) {
		lines.push("");
		lines.push(MSG_RESTART);
	}
	return lines.join("\n");
}
