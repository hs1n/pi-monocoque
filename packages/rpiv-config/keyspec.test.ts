/**
 * keyspec tests — the KeyId grammar, its display form, and the resolution ladder.
 *
 * The grammar cases come from `rpiv-todo`'s validator suite and the display cases from
 * `rpiv-ask-user-question`'s formatter suite: merged rather than copied, because one authoritative
 * set for the grammar is the point of the extraction. Each consumer keeps the tests that are
 * genuinely its own — the default it supplies, and the wiring that supplies it.
 */

import { describe, expect, it } from "vitest";
import {
	COLLAPSE_KEY_OFF,
	formatKeySpecForDisplay,
	isValidCollapseKeySpec,
	resolveCollapseKeySpec,
} from "./keyspec.js";

describe("isValidCollapseKeySpec", () => {
	it("accepts valid specs", () => {
		expect(isValidCollapseKeySpec("ctrl+shift+t")).toBe(true);
		expect(isValidCollapseKeySpec("alt+o")).toBe(true);
		expect(isValidCollapseKeySpec("escape")).toBe(true);
		expect(isValidCollapseKeySpec("f5")).toBe(true);
		expect(isValidCollapseKeySpec("ctrl+]")).toBe(true);
	});

	it("rejects empty spec", () => {
		expect(isValidCollapseKeySpec("")).toBe(false);
	});

	it("rejects leading, trailing, and double '+'", () => {
		expect(isValidCollapseKeySpec("+")).toBe(false);
		expect(isValidCollapseKeySpec("+t")).toBe(false);
		expect(isValidCollapseKeySpec("ctrl+")).toBe(false);
		expect(isValidCollapseKeySpec("ctrl++t")).toBe(false);
	});

	it("rejects unknown modifiers", () => {
		expect(isValidCollapseKeySpec("win+t")).toBe(false);
	});

	it("rejects duplicate modifiers", () => {
		expect(isValidCollapseKeySpec("ctrl+ctrl+t")).toBe(false);
	});

	it("rejects typo bases (multi-char non-special)", () => {
		// 'ctr' is 3 chars and not a named special key → a typo for 'ctrl'.
		expect(isValidCollapseKeySpec("ctr+t")).toBe(false);
	});

	it("rejects the off sentinel — it is handled by the ladder, not the grammar", () => {
		expect(isValidCollapseKeySpec(COLLAPSE_KEY_OFF)).toBe(false);
	});
});

describe("formatKeySpecForDisplay", () => {
	it("capitalizes each +-part of a resolved spec", () => {
		expect(formatKeySpecForDisplay("ctrl+]")).toBe("Ctrl+]");
		expect(formatKeySpecForDisplay("alt+o")).toBe("Alt+O");
		expect(formatKeySpecForDisplay("ctrl+shift+h")).toBe("Ctrl+Shift+H");
	});

	it("handles named special keys and bare keys", () => {
		expect(formatKeySpecForDisplay("f9")).toBe("F9");
		expect(formatKeySpecForDisplay("alt+escape")).toBe("Alt+Escape");
		expect(formatKeySpecForDisplay("]")).toBe("]");
	});

	it("cases compound-word named keys conventionally", () => {
		expect(formatKeySpecForDisplay("ctrl+pagedown")).toBe("Ctrl+PageDown");
		expect(formatKeySpecForDisplay("pageup")).toBe("PageUp");
	});

	it("round-trips a consumer's default key to the historical hint casing", () => {
		expect(formatKeySpecForDisplay("ctrl+]")).toBe("Ctrl+]");
	});

	it("pairs every compound-word casing with a name the grammar accepts", () => {
		// The display table is a reading of SPECIAL_KEYS: these names are the only multi-char keys
		// whose conventional casing is not plain first-letter capitalization. Asserting both halves
		// here means a rename on either side fails this test instead of silently rendering "Pageup"
		// in the UI copy.
		for (const [name, display] of [
			["pageup", "PageUp"],
			["pagedown", "PageDown"],
		] as const) {
			expect(isValidCollapseKeySpec(name)).toBe(true);
			expect(formatKeySpecForDisplay(name)).toBe(display);
		}
	});
});

describe("resolveCollapseKeySpec", () => {
	const FALLBACK = "ctrl+shift+t";

	it("returns the fallback for a missing, empty, or blank value", () => {
		expect(resolveCollapseKeySpec(undefined, FALLBACK)).toBe(FALLBACK);
		expect(resolveCollapseKeySpec("", FALLBACK)).toBe(FALLBACK);
		expect(resolveCollapseKeySpec("   ", FALLBACK)).toBe(FALLBACK);
	});

	it("trims and lowercases a valid spec", () => {
		expect(resolveCollapseKeySpec("  Ctrl+Shift+T  ", FALLBACK)).toBe("ctrl+shift+t");
		expect(resolveCollapseKeySpec("ALT+O", FALLBACK)).toBe("alt+o");
	});

	it("returns the sentinel unchanged, case-insensitively, before validating it", () => {
		// "off" is not a valid KeyId: were the grammar checked first, disabling the shortcut would
		// fall through to the fallback and silently ARM it.
		expect(resolveCollapseKeySpec(COLLAPSE_KEY_OFF, FALLBACK)).toBe(COLLAPSE_KEY_OFF);
		expect(resolveCollapseKeySpec("OFF", FALLBACK)).toBe(COLLAPSE_KEY_OFF);
		expect(resolveCollapseKeySpec("  off  ", FALLBACK)).toBe(COLLAPSE_KEY_OFF);
	});

	it("falls back for a malformed spec rather than a bare-keypress match", () => {
		// The typo the grammar exists to catch: pi-tui would resolve this to a global `]` capture.
		expect(resolveCollapseKeySpec("ctr+]", FALLBACK)).toBe(FALLBACK);
		expect(resolveCollapseKeySpec("+ctrl+]", FALLBACK)).toBe(FALLBACK);
		expect(resolveCollapseKeySpec("win+t", FALLBACK)).toBe(FALLBACK);
	});

	it("falls back for a non-string value instead of throwing", () => {
		expect(resolveCollapseKeySpec(42, FALLBACK)).toBe(FALLBACK);
		expect(resolveCollapseKeySpec(null, FALLBACK)).toBe(FALLBACK);
		expect(resolveCollapseKeySpec({ key: "alt+o" }, FALLBACK)).toBe(FALLBACK);
	});

	it("keeps the consumer's own default when the spec is valid", () => {
		expect(resolveCollapseKeySpec("ctrl+]", FALLBACK)).toBe("ctrl+]");
		expect(resolveCollapseKeySpec(undefined, "ctrl+]")).toBe("ctrl+]");
	});
});
