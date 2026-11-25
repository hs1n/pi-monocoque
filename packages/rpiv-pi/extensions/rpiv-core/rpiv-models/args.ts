/**
 * rpiv-models/args — the argument path of /rpiv-models.
 *
 * The argument path does not open a picker, so it works with and without a UI:
 *
 *   /rpiv-models show
 *   /rpiv-models set defaults <model> [effort]
 *   /rpiv-models set agents|skills <name> <model> [effort]
 *   /rpiv-models unset defaults
 *   /rpiv-models unset agents|skills <name>
 *
 * The parser checks all tokens before it writes. It uses the same sources as
 * the pickers: the SCOPES table, the bundled agent names, the registered skill
 * names, the model registry, and the effort items of the model. An invalid
 * command shows an error and the usage, and does not write the file.
 */

import type { Api, Model } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem } from "@earendil-works/pi-tui";
import { modelKey } from "@hs1n/rpiv-config";
import { CONFIG_PATH, type ModelThinkingLevelValue } from "../models-config.js";
import { bundledAgentNames, skillCommandNames } from "../models-config-sources.js";
import { buildEffortItems, INHERIT_VALUE, loadRawConfig } from "./items.js";
import { SCOPE_AGENTS, SCOPE_DEFAULTS, SCOPE_SKILLS, SCOPES } from "./overrides.js";
import { resetOverride, saveOverride } from "./writes.js";

const SUB_SHOW = "show";
const SUB_SET = "set";
const SUB_UNSET = "unset";
const SUBCOMMANDS = [SUB_SHOW, SUB_SET, SUB_UNSET];
const SCOPE_NAMES = Object.keys(SCOPES);

export const MSG_MODELS_USAGE = [
	"Usage:",
	"  /mono-models show",
	"  /mono-models set defaults <model> [effort]",
	"  /mono-models set agents <agent> <model> [effort]",
	"  /mono-models set skills <skill> <model> [effort]",
	"  /mono-models unset defaults",
	"  /mono-models unset agents <agent>",
	"  /mono-models unset skills <skill>",
	"<model> is provider/id. [effort] is off or a reasoning level that the model supports.",
	"If you do not give [effort], the override keeps the session effort.",
].join("\n");

/** A parsed scope and key path, or an error message. */
type TargetResult = { ok: true; scope: string; keyPath: string[]; rest: string[] } | { ok: false; error: string };

/** Show an error and the usage. The caller must not write after this. */
function fail(ctx: ExtensionContext, error: string): void {
	ctx.ui.notify(`${error}\n\n${MSG_MODELS_USAGE}`, "error");
}

/** Text of the current overrides in models.json. */
function formatConfig(): string {
	const raw = loadRawConfig();
	if (Object.keys(raw).length === 0) return `No model overrides are set in ${CONFIG_PATH}.`;
	return `Model overrides in ${CONFIG_PATH}:\n${JSON.stringify(raw, null, 2)}`;
}

/** No UI and no arguments: show the current config and the usage. */
export function showConfigAndUsage(ctx: ExtensionContext): void {
	ctx.ui.notify(`${formatConfig()}\n\n${MSG_MODELS_USAGE}`, "info");
}

/** Names that are valid keys for a scope. `defaults` has no keys. */
function namesFor(scope: string, pi: ExtensionAPI): string[] {
	if (scope === SCOPE_AGENTS) return bundledAgentNames();
	if (scope === SCOPE_SKILLS) return skillCommandNames(pi);
	return [];
}

/**
 * Names for a completion. Before the runtime binds, pi.getCommands() can throw.
 * A completion must not throw, so this gives no names in that case.
 */
function completionNamesFor(scope: string, pi: ExtensionAPI): string[] {
	try {
		return namesFor(scope, pi);
	} catch {
		return [];
	}
}

/** Parse `<scope> [<name>]` from the start of `tokens`. */
function parseTarget(tokens: string[], pi: ExtensionAPI): TargetResult {
	const [scope, ...after] = tokens;
	if (!scope) return { ok: false, error: "Scope is missing." };
	if (!SCOPES[scope]) return { ok: false, error: `Unknown scope: ${scope}. Use one of: ${SCOPE_NAMES.join(", ")}.` };
	if (scope === SCOPE_DEFAULTS) return { ok: true, scope, keyPath: [], rest: after };
	const [name, ...rest] = after;
	const kind = scope === SCOPE_AGENTS ? "agent" : "skill";
	if (!name) return { ok: false, error: `The ${kind} name is missing.` };
	const names = namesFor(scope, pi);
	if (!names.includes(name)) {
		const known = names.length > 0 ? names.join(", ") : "none";
		return { ok: false, error: `Unknown ${kind}: ${name}. Known ${kind}s: ${known}.` };
	}
	return { ok: true, scope, keyPath: [name], rest };
}

/** Effort values that the model accepts (the effort picker items, without "inherit"). */
function effortValues(model: Model<Api>): string[] {
	if (!model.reasoning) return [];
	return buildEffortItems(model)
		.map((i) => i.value)
		.filter((v) => v !== INHERIT_VALUE);
}

/** Validate and write a `set`. Returns an error message, or undefined after the write. */
function runSet(tokens: string[], ctx: ExtensionContext, pi: ExtensionAPI): string | undefined {
	const target = parseTarget(tokens, pi);
	if (!target.ok) return target.error;
	const [modelArg, effortArg, ...extra] = target.rest;
	if (!modelArg) return "Model is missing.";
	if (extra.length > 0) return `Too many arguments: ${extra.join(" ")}.`;
	const model = ctx.modelRegistry.getAvailable().find((m) => modelKey(m) === modelArg);
	if (!model) return `Unknown model: ${modelArg}. Use provider/id of an available model.`;
	let effort: ModelThinkingLevelValue | undefined;
	if (effortArg !== undefined) {
		const allowed = effortValues(model);
		if (allowed.length === 0) return `Model ${modelArg} does not support a reasoning effort.`;
		if (!allowed.includes(effortArg)) {
			return `Unknown effort: ${effortArg}. Use one of: ${allowed.join(", ")}.`;
		}
		effort = effortArg as ModelThinkingLevelValue;
	}
	saveOverride(ctx, target.scope, target.keyPath, modelArg, effort);
	return undefined;
}

/** Validate and write an `unset`. Returns an error message, or undefined after the write. */
function runUnset(tokens: string[], ctx: ExtensionContext, pi: ExtensionAPI): string | undefined {
	const target = parseTarget(tokens, pi);
	if (!target.ok) return target.error;
	if (target.rest.length > 0) return `Too many arguments: ${target.rest.join(" ")}.`;
	resetOverride(ctx, target.scope, target.keyPath);
	return undefined;
}

/** Run one subcommand. Returns an error message, or undefined on success. */
function runSubcommand(sub: string, tokens: string[], ctx: ExtensionContext, pi: ExtensionAPI): string | undefined {
	if (sub === SUB_SET) return runSet(tokens, ctx, pi);
	if (sub === SUB_UNSET) return runUnset(tokens, ctx, pi);
	if (sub !== SUB_SHOW) return `Unknown subcommand: ${sub}. Use one of: ${SUBCOMMANDS.join(", ")}.`;
	if (tokens.length > 0) return `Too many arguments: ${tokens.join(" ")}.`;
	ctx.ui.notify(formatConfig(), "info");
	return undefined;
}

/** Run /rpiv-models with arguments. `args` must contain at least one token. */
export function runModelsArgs(args: string, ctx: ExtensionContext, pi: ExtensionAPI): void {
	const [sub, ...tokens] = args.trim().split(/\s+/);
	const error = runSubcommand(sub, tokens, ctx, pi);
	if (error) fail(ctx, error);
}

/**
 * Argument completions: subcommands, then scopes, then agent or skill names.
 * The host does not give a model registry to this function, so it does not
 * complete model ids. Each item value is the full argument text, because the
 * host replaces all of the argument text with it.
 */
export function getModelsArgCompletions(prefix: string, pi: ExtensionAPI): AutocompleteItem[] | null {
	const words = prefix.trimStart().split(/\s+/);
	const last = words.pop() ?? "";
	let candidates: string[] = [];
	if (words.length === 0) candidates = SUBCOMMANDS;
	else if (words[0] === SUB_SET || words[0] === SUB_UNSET) {
		if (words.length === 1) candidates = SCOPE_NAMES;
		else if (words.length === 2) candidates = completionNamesFor(words[1], pi);
	}
	const head = words.length > 0 ? `${words.join(" ")} ` : "";
	const items = candidates.filter((c) => c.startsWith(last)).map((c) => ({ value: `${head}${c}`, label: c }));
	return items.length > 0 ? items : null;
}
