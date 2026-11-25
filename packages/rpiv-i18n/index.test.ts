/**
 * Handler-level tests for the /languages slash command — symmetric with the
 * handler-failure tests in rpiv-advisor + rpiv-web-tools + rpiv-voice.
 *
 * The SDK-level boolean return of saveLocaleConfig is asserted in i18n.test.ts.
 * This file exercises the persist-first save-then-apply invariant — i.e. that a failed disk write produces
 * an error notification AND skips applyLocale, leaving the in-memory locale
 * untouched so the next session's detection chain runs cleanly.
 */

import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { createMockCtx, createMockPi } from "@hs1n/rpiv-test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./i18n-ui.js", () => ({
	showLanguagePicker: vi.fn(),
}));

import { __resetState, applyLocale, getActiveLocale, loadLocaleConfig } from "./i18n.js";
import { showLanguagePicker } from "./i18n-ui.js";
import registerI18n from "./index.js";

const LOCALE_CONFIG_PATH = join(process.env.HOME!, ".config", "rpiv-i18n", "locale.json");

function registerAndCaptureLanguages() {
	const { pi, captured } = createMockPi();
	registerI18n(pi);
	return { pi, captured, handler: () => captured.commands.get("languages")?.handler };
}

beforeEach(() => {
	__resetState();
	vi.mocked(showLanguagePicker).mockReset();
	rmSync(LOCALE_CONFIG_PATH, { force: true });
});

afterEach(() => {
	// Drain anything our EISDIR trick leaves behind.
	try {
		rmSync(LOCALE_CONFIG_PATH, { recursive: true, force: true });
	} catch {
		/* ignore */
	}
});

describe("/languages — command shape", () => {
	it("registers under 'languages'", () => {
		const { captured } = registerAndCaptureLanguages();
		expect(captured.commands.has("languages")).toBe(true);
	});
});

const USAGE = "Usage: /languages <locale> | /languages system";

describe("/languages — !hasUI, no arguments", () => {
	it("prints the current locale and usage, and never opens the picker", async () => {
		applyLocale("de");
		const { captured } = registerAndCaptureLanguages();
		const ctx = createMockCtx({ hasUI: false });
		await captured.commands.get("languages")?.handler("", ctx as never);
		expect(ctx.ui.notify).toHaveBeenCalledWith(`Language: de\n${USAGE}`, "info");
		expect(showLanguagePicker).not.toHaveBeenCalled();
	});

	it("prints 'system default' when no locale is set", async () => {
		const { captured } = registerAndCaptureLanguages();
		const ctx = createMockCtx({ hasUI: false });
		await captured.commands.get("languages")?.handler("", ctx as never);
		expect(ctx.ui.notify).toHaveBeenCalledWith(`Language: system default\n${USAGE}`, "info");
	});
});

describe("/languages <locale> — argument sets the locale without a UI", () => {
	it("valid code: persists, applies, notifies", async () => {
		const { captured } = registerAndCaptureLanguages();
		const ctx = createMockCtx({ hasUI: false });
		await captured.commands.get("languages")?.handler(" pt-BR ", ctx as never);
		expect(getActiveLocale()).toBe("pt-BR");
		expect(loadLocaleConfig()).toEqual({ locale: "pt-BR" });
		expect(ctx.ui.notify).toHaveBeenCalledWith("Language: pt-BR", "info");
		expect(showLanguagePicker).not.toHaveBeenCalled();
	});

	it("'system' clears the locale (the picker's System default row)", async () => {
		applyLocale("uk");
		const { captured } = registerAndCaptureLanguages();
		const ctx = createMockCtx({ hasUI: false });
		await captured.commands.get("languages")?.handler("system", ctx as never);
		expect(getActiveLocale()).toBeUndefined();
		expect(ctx.ui.notify).toHaveBeenCalledWith("Language: system default", "info");
	});

	it.each([
		["xx", "Unknown locale: xx. Valid values: de, en, es, fr, pt, pt-BR, ru, uk, zh, zh-TW, system"],
		["de fr", `Too many arguments. ${USAGE}`],
	])("invalid argument %s: error, locale and config unchanged", async (args, message) => {
		applyLocale("en");
		const { captured } = registerAndCaptureLanguages();
		const ctx = createMockCtx({ hasUI: false });
		await captured.commands.get("languages")?.handler(args, ctx as never);
		expect(ctx.ui.notify).toHaveBeenCalledWith(message, "error");
		expect(ctx.ui.notify).toHaveBeenCalledTimes(1);
		expect(getActiveLocale()).toBe("en");
		expect(existsSync(LOCALE_CONFIG_PATH)).toBe(false);
	});
});

describe("/languages — argument completions", () => {
	it("offers the locale codes and 'system' that match the prefix", () => {
		const { captured } = registerAndCaptureLanguages();
		const complete = captured.commands.get("languages")?.getArgumentCompletions;
		expect(complete?.("zh")).toEqual([
			{ value: "zh", label: "zh", description: "简体中文" },
			{ value: "zh-TW", label: "zh-TW", description: "繁體中文" },
		]);
		expect(complete?.("sy")).toEqual([{ value: "system", label: "system", description: "System default" }]);
		expect(complete?.("qq")).toBeNull();
	});
});

describe("/languages — UI, no arguments", () => {
	it("opens the picker and applies the choice", async () => {
		vi.mocked(showLanguagePicker).mockResolvedValueOnce("es");
		const { captured } = registerAndCaptureLanguages();
		const ctx = createMockCtx({ hasUI: true });
		await captured.commands.get("languages")?.handler("", ctx as never);
		expect(showLanguagePicker).toHaveBeenCalledTimes(1);
		expect(getActiveLocale()).toBe("es");
		expect(ctx.ui.notify).toHaveBeenCalledWith("Language: es", "info");
	});
});

describe("/languages — picker cancelled", () => {
	it("no-ops when showLanguagePicker resolves null", async () => {
		vi.mocked(showLanguagePicker).mockResolvedValueOnce(null);
		const { captured } = registerAndCaptureLanguages();
		const ctx = createMockCtx({ hasUI: true });
		await captured.commands.get("languages")?.handler("", ctx as never);
		expect(ctx.ui.notify).not.toHaveBeenCalled();
		expect(getActiveLocale()).toBeUndefined();
	});
});

describe("/languages — save failure (save-then-apply invariant, review I1 from prior round)", () => {
	it("EISDIR on save: error notify; applyLocale skipped; in-memory locale unchanged", async () => {
		if (process.platform === "win32") return;
		// Pre-seed in-memory locale so we can prove the handler does NOT touch it
		// on failure (would be silently reverted on next start otherwise).
		applyLocale("en");
		expect(getActiveLocale()).toBe("en");

		// Force EISDIR by mkdir at the file path — same trick web-tools + advisor use.
		mkdirSync(dirname(LOCALE_CONFIG_PATH), { recursive: true });
		mkdirSync(LOCALE_CONFIG_PATH, { recursive: true });

		vi.mocked(showLanguagePicker).mockResolvedValueOnce("uk");
		const { captured } = registerAndCaptureLanguages();
		const ctx = createMockCtx({ hasUI: true });

		await captured.commands.get("languages")?.handler("", ctx as never);

		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("Failed to save locale preference"), "error");
		// Success notify must NOT have fired — would deliver a contradictory
		// "Language: uk" alongside the error message.
		expect(ctx.ui.notify).not.toHaveBeenCalledWith(expect.stringContaining("Language: uk"), "info");
		// applyLocale skipped — in-memory locale is whatever we pre-seeded, not "uk".
		expect(getActiveLocale()).toBe("en");
	});
});
