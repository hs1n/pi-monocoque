/**
 * rpiv-core — Pure-orchestrator extension for rpiv-pi.
 *
 * Composes session hooks and the slash commands. All logic lives in the
 * registrar modules; this file is the table of contents.
 *
 * Tool-owning plugins are siblings (see siblings.ts); install via /rpiv-setup.
 *
 * The workflow runner and its `/wf` command are gone. Multi-stage work is
 * orchestrated by hand with Pi's own `Agent` and `SubagentWorkflow` tools.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { FLAG_DEBUG } from "./constants.js";
import { registerModelsConfigValidation } from "./models-config-validate.js";
import { registerRpivModelsCommand } from "./rpiv-models/index.js";
import { registerSessionCapture } from "./session-capture.js";
import { registerSessionHooks } from "./session-hooks.js";
import { registerSetupCommand } from "./setup-command.js";
import { registerSkillBracket } from "./skill-bracket.js";
import { registerUpdateAgentsCommand } from "./update-agents-command.js";

export default function (pi: ExtensionAPI) {
	pi.registerFlag(FLAG_DEBUG, {
		description: "Show injected guidance and git-context messages",
		type: "boolean",
		default: false,
	});
	// These three register UNCONDITIONALLY and FIRST — they must work on a clean
	// install where an rpiv sibling is absent, so the missing-sibling banner and
	// /rpiv-setup are what guide the user to install it.
	registerSessionHooks(pi);
	registerUpdateAgentsCommand(pi);
	registerSetupCommand(pi);
	registerRpivModelsCommand(pi); // /rpiv-models cascade picker
	// Warn-on-miss: surface models.json record-key typos (skills.committ)
	// that pass schema validation but silently never apply.
	registerModelsConfigValidation(pi);
	// Model/effort capture for the standalone /skill: bracket: the session_start
	// hook records modelRegistry + current model + the foreground uiContext, and
	// the bracket below reads the captured baseline.
	registerSessionCapture(pi);
	// Standalone /skill: model/effort override bracket. MUST register AFTER
	// registerSessionCapture so the bracket's `getCapturedModel()` read at
	// input-arm time sees the populated baseline.
	registerSkillBracket(pi);
}
