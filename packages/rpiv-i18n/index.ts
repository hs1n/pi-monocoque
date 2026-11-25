/**
 * @hs1n/rpiv-i18n — Pi extension entry point.
 *
 * Wires:
 *   - --locale CLI flag (pi.registerFlag)
 *   - /languages slash command (argument or interactive picker)
 *   - session_start hook (applies flag → config → LANG → English priority chain)
 *
 * Exposes i18n state via globalThis[Symbol.for("rpiv-i18n")] as plain data.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem, SelectItem } from "@earendil-works/pi-tui";
import {
	applyLocale,
	detectLocaleFromConfigAndEnv,
	getActiveLocale,
	SUPPORTED_LOCALES,
	saveLocaleConfig,
} from "./i18n.js";
import { showLanguagePicker } from "./i18n-ui.js";

const FLAG_NAME = "locale";
const COMMAND_NAME = "languages";
const NO_LOCALE_VALUE = "__system__";
const CHECKMARK = " ✓";
// Argument word for the picker's "System default" row.
const SYSTEM_ARG = "system";
const MSG_USAGE = `Usage: /languages <locale> | /languages ${SYSTEM_ARG}`;
const MSG_TOO_MANY_ARGS = `Too many arguments. ${MSG_USAGE}`;
const MSG_PERSIST_FAILED = "Failed to save locale preference — selection not persisted";
const msgLocaleSet = (code: string | undefined) => (code ? `Language: ${code}` : "Language: system default");
const msgLocaleCurrent = (code: string | undefined) => `${msgLocaleSet(code)}\n${MSG_USAGE}`;
const LOCALE_ARGS: readonly string[] = [...SUPPORTED_LOCALES.map((l) => l.code), SYSTEM_ARG];
const errUnknownLocale = (arg: string) => `Unknown locale: ${arg}. Valid values: ${LOCALE_ARGS.join(", ")}`;

// Save first, then apply. A successful applyLocale followed by a failed disk
// write would silently revert at next start with no diagnostic surface.
function setLocale(ctx: ExtensionContext, next: string | undefined): void {
	if (!saveLocaleConfig(next)) {
		ctx.ui.notify(MSG_PERSIST_FAILED, "error");
		return;
	}
	applyLocale(next);
	ctx.ui.notify(msgLocaleSet(next), "info");
}

// The host replaces the full argument text with the item value.
function completeLocale(prefix: string): AutocompleteItem[] | null {
	const typed = prefix.trim();
	const items = LOCALE_ARGS.filter((code) => code.startsWith(typed)).map((code) => ({
		value: code,
		label: code,
		description: SUPPORTED_LOCALES.find((l) => l.code === code)?.label ?? "System default",
	}));
	return items.length > 0 ? items : null;
}

export default function (pi: ExtensionAPI): void {
	pi.registerFlag(FLAG_NAME, {
		type: "string",
		description: "UI locale code (e.g. en, uk, es, de)",
	});

	pi.on("session_start", async () => {
		const flagValue = pi.getFlag(FLAG_NAME);
		const fromFlag = typeof flagValue === "string" && flagValue.length > 0 ? flagValue : undefined;
		applyLocale(fromFlag ?? detectLocaleFromConfigAndEnv());
	});

	pi.registerCommand(COMMAND_NAME, {
		description: "Select UI language for rpiv-* TUI strings",
		getArgumentCompletions: completeLocale,
		handler: async (args, ctx) => {
			const words = args
				.trim()
				.split(/\s+/)
				.filter((w) => w.length > 0);
			if (words.length > 1) {
				ctx.ui.notify(MSG_TOO_MANY_ARGS, "error");
				return;
			}
			const [arg] = words;
			if (arg !== undefined) {
				if (!LOCALE_ARGS.includes(arg)) {
					ctx.ui.notify(errUnknownLocale(arg), "error");
					return;
				}
				setLocale(ctx, arg === SYSTEM_ARG ? undefined : arg);
				return;
			}
			if (!ctx.hasUI) {
				ctx.ui.notify(msgLocaleCurrent(getActiveLocale()), "info");
				return;
			}
			const current = getActiveLocale();
			const items: SelectItem[] = SUPPORTED_LOCALES.map((l) => ({
				value: l.code,
				label: `${l.label} (${l.code})${current === l.code ? CHECKMARK : ""}`,
			}));
			items.push({
				value: NO_LOCALE_VALUE,
				label: current === undefined ? `System default${CHECKMARK}` : "System default",
			});

			const choice = await showLanguagePicker(ctx, items);
			if (!choice) return;

			setLocale(ctx, choice === NO_LOCALE_VALUE ? undefined : choice);
		},
	});
}
