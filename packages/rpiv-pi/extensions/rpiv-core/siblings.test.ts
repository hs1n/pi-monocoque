import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LEGACY_SIBLINGS, resolveInstallSpec, SIBLINGS } from "./siblings.js";

describe("SIBLINGS registry", () => {
	it("contains 8 entries (pi-subagents at SIBLINGS[0] — tintinweb fork is the dispatch runtime)", () => {
		expect(SIBLINGS).toHaveLength(8);
	});

	it("includes rpiv-workflow (the /wf runtime sibling)", () => {
		expect(SIBLINGS.find((s) => s.pkg === "npm:@hs1n/rpiv-workflow")).toBeDefined();
	});

	it("lists @tintinweb/pi-subagents at SIBLINGS[0]", () => {
		expect(SIBLINGS[0]?.pkg).toBe("npm:@tintinweb/pi-subagents");
	});

	it("does NOT list nicobailon's unscoped pi-subagents (superseded in 0.14.0)", () => {
		expect(SIBLINGS.find((s) => s.pkg === "npm:pi-subagents")).toBeUndefined();
	});

	it("does NOT list rpiv-btw (standalone-only — rpiv-pi has no runtime dependency on it)", () => {
		expect(SIBLINGS.find((s) => s.pkg === "npm:@hs1n/rpiv-btw")).toBeUndefined();
	});

	for (const s of SIBLINGS) {
		it(`${s.pkg} — self-match against settings.json line shape`, () => {
			expect(s.matches.test(s.pkg.replace(/^npm:/, ""))).toBe(true);
		});
		it(`${s.pkg} — case-insensitive match`, () => {
			expect(s.matches.test(s.pkg.toUpperCase().replace(/^NPM:/, ""))).toBe(true);
		});
	}

	it("rpiv-args does NOT match rpiv-args-extended (word boundary)", () => {
		const argsEntry = SIBLINGS.find((s) => s.pkg.endsWith("/rpiv-args"));
		expect(argsEntry).toBeDefined();
		expect(argsEntry?.matches.test("@hs1n/rpiv-args-extended")).toBe(false);
	});

	it("rpiv-i18n does NOT match rpiv-i18n-utils (word boundary)", () => {
		const i18nEntry = SIBLINGS.find((s) => s.pkg.endsWith("/rpiv-i18n"));
		expect(i18nEntry).toBeDefined();
		expect(i18nEntry?.matches.test("@hs1n/rpiv-i18n-utils")).toBe(false);
		expect(i18nEntry?.matches.test("@hs1n/rpiv-i18n")).toBe(true);
	});

	it("pi-subagents SIBLINGS[0] matches BOTH the @tintinweb/pi-subagents fork and the @gotgenes/pi-subagents fork", () => {
		const subagentsEntry = SIBLINGS[0];
		expect(subagentsEntry).toBeDefined();
		// Upstream fork (default install target via /rpiv-setup)
		expect(subagentsEntry?.matches.test("@tintinweb/pi-subagents")).toBe(true);
		// @gotgenes/pi-subagents — API-compatible fork with the same tool surface
		expect(subagentsEntry?.matches.test("@gotgenes/pi-subagents")).toBe(true);
	});

	it("pi-subagents SIBLINGS[0] regex is case-insensitive across both fork namespaces", () => {
		const subagentsEntry = SIBLINGS[0];
		expect(subagentsEntry?.matches.test("@TINTINWEB/PI-SUBAGENTS")).toBe(true);
		expect(subagentsEntry?.matches.test("@GOTGENES/PI-SUBAGENTS")).toBe(true);
	});

	it("pi-subagents SIBLINGS[0] regex does NOT match unrelated @-scoped pi-subagents-* variants", () => {
		const subagentsEntry = SIBLINGS[0];
		// Word-boundary guard: must not over-match a hypothetical future sibling
		// such as `@hs1n/pi-subagents-utils` (a dash right after the
		// `pi-subagents` token is excluded via `(?![-\w])`).
		expect(subagentsEntry?.matches.test("@tintinweb/pi-subagents-utils")).toBe(false);
		expect(subagentsEntry?.matches.test("@gotgenes/pi-subagents-utils")).toBe(false);
	});

	it("every entry has non-empty pkg + provides", () => {
		for (const s of SIBLINGS) {
			expect(s.pkg.length).toBeGreaterThan(0);
			expect(s.provides.length).toBeGreaterThan(0);
		}
	});
});

describe("LEGACY_SIBLINGS registry", () => {
	it("lists nicobailon's pi-subagents for pruning (superseded by @tintinweb/pi-subagents in 0.14.0)", () => {
		const entry = LEGACY_SIBLINGS.find((l) => l.label === "pi-subagents");
		expect(entry).toBeDefined();
		expect(entry?.matches.test("npm:pi-subagents")).toBe(true);
		expect(entry?.matches.test("pi-subagents")).toBe(true);
	});

	it("pi-subagents legacy match does NOT catch @tintinweb/pi-subagents (active sibling)", () => {
		const piSubagents = LEGACY_SIBLINGS.find((l) => l.label === "pi-subagents");
		expect(piSubagents?.matches.test("@tintinweb/pi-subagents")).toBe(false);
	});

	it("pi-subagents legacy match does NOT catch pi-subagents-legacy (word boundary)", () => {
		const piSubagents = LEGACY_SIBLINGS.find((l) => l.label === "pi-subagents");
		expect(piSubagents?.matches.test("pi-subagents-legacy")).toBe(false);
	});
});

describe("resolveInstallSpec", () => {
	it("resolves this repo's own siblings to their local package directory", () => {
		const spec = resolveInstallSpec("npm:@hs1n/rpiv-todo");
		expect(spec).not.toMatch(/^npm:/);
		expect(spec.endsWith("/packages/rpiv-todo")).toBe(true);
		expect(existsSync(join(spec, "package.json"))).toBe(true);
	});

	it("resolves every @hs1n sibling in the registry to a directory that exists", () => {
		for (const s of SIBLINGS.filter((s) => s.pkg.startsWith("npm:@hs1n/"))) {
			const spec = resolveInstallSpec(s.pkg);
			expect(spec, s.pkg).not.toMatch(/^npm:/);
			expect(existsSync(join(spec, "package.json")), spec).toBe(true);
		}
	});

	it("leaves a third-party sibling on npm", () => {
		expect(resolveInstallSpec("npm:@tintinweb/pi-subagents")).toBe("npm:@tintinweb/pi-subagents");
	});

	it("falls back to the npm spec when the package directory is absent", () => {
		expect(resolveInstallSpec("npm:@hs1n/rpiv-nonexistent")).toBe("npm:@hs1n/rpiv-nonexistent");
	});

	it("passes through a non-npm spec untouched", () => {
		expect(resolveInstallSpec("/some/local/path")).toBe("/some/local/path");
	});
});
